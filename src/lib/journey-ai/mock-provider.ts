/**
 * MockJourneyAIProvider — APENAS SIMULAÇÃO. Não é IA e não usa as instruções
 * do agente (jornada-impacto-system-prompt.md).
 *
 * Funciona sem chave de API e com respostas determinísticas (heurísticas de
 * texto), para testes sem custo e demonstração da interface. Só é usado com
 * AI_PROVIDER=mock: com AI_PROVIDER=external nunca há fallback para cá — uma
 * configuração incompleta vira erro visível (ver provider.ts e turn.ts).
 * Tudo o que ele gera é gravado com isMock = true e promptVersion = null; em
 * desenvolvimento, o chat mostra "Modo IA: Mock".
 *
 * O mock segue as mesmas regras metodológicas esperadas do agente real:
 * uma decisão por vez, sem inventar números ou metas.
 */
import { ACTION_IDS, PROPOSAL_ACTIONS, navigateAction } from "@/lib/journey/actions";
import { linesToText, activityLines, outcomeLines, stripTrailingPeriod, twoDigits, upperFirst } from "@/lib/journey/format";
import { consolidateEvidencePlan, isActivityComplete, outcomeNextStep } from "@/lib/journey/progress";
import type { ActivityPayload, EvidencePlanPayload, ImpactPayload, OutcomePayload } from "@/lib/journey/proposal-schemas";
import { assessActivityDescription, findExclusiveCausalityTerms } from "@/lib/journey/rules";
import { stageTitle, type JourneyStageKey } from "@/lib/journey/stages";
import type { ActivityView, JourneySnapshot, OutcomeView } from "@/lib/journey/types";
import {
  activityTargetQuestion,
  audienceShort,
  buildActivityPayload,
  extractDeadline,
  extractDurationMonths,
  extractPeriodAfterEnd,
  extractQuantity,
  formulateActivity,
  formulateImpact,
  outcomePredicate,
  outcomeSuggestionText,
  suggestOutcomeIndicator,
  suggestOutcomes,
} from "@/lib/journey-ai/mock-heuristics";
import type { JourneyAIAction, JourneyAIProvider, JourneyAIRequest, JourneyAIResponse } from "@/lib/journey-ai/types";

type Reply = Omit<JourneyAIResponse, "currentStage">;

const proposalActions = (): JourneyAIAction[] => PROPOSAL_ACTIONS.map((a) => ({ ...a }));

const approveStageAction = (label = "Aprovar etapa"): JourneyAIAction => ({
  id: ACTION_IDS.APPROVE_STAGE,
  label,
  intent: "APPROVE",
});

export const IMPACT_OPTION_ACTIONS: JourneyAIAction[] = [
  { id: "impact-option:VISION_ONLY", label: "Manter como visão de longo prazo", intent: "CONTINUE" },
  { id: "impact-option:FOLLOW_UP_CHANGE", label: "Acompanhar uma mudança depois do projeto", intent: "CONTINUE" },
  { id: "impact-option:FUTURE_EVALUATION", label: "Planejar uma avaliação futura", intent: "CONTINUE" },
  { id: "show-examples", label: "Ver exemplos", intent: "SHOW_EXAMPLES" },
];

function say(message: string, actions: JourneyAIAction[] = [], extra: Partial<Reply> = {}): Reply {
  return { message, actions, requiresApproval: false, ...extra };
}

function propose(message: string, proposal: NonNullable<Reply["proposal"]>, extra: Partial<Reply> = {}): Reply {
  return { message, proposal, actions: proposalActions(), requiresApproval: true, state: null, ...extra };
}

function remindPending(): Reply {
  return say(
    "Há uma proposta aguardando sua decisão logo acima. Use **Editar** para ajustá-la, **Aprovar** para registrá-la ou **Excluir** para descartá-la.",
    proposalActions(),
    { requiresApproval: true },
  );
}

/** Mapeamento: uma atividade por linha, item de lista ou separada por ";". */
function splitActivities(text: string): string[] {
  return text
    .split(/\n|;/)
    .map((line) => line.replace(/^\s*(?:[-•*]|\d+[.)])\s*/, "").trim())
    .filter((line) => line.length > 0);
}

/** Respostas que encerram a meta sem acrescentar nada ("não", "só isso", "pode seguir"). */
const NOTHING_TO_ADD = /^(n[aã]o|nada|s[oó] isso|[eé] isso|est[aá] completa|completa|ok|pode seguir|segue|sem mais)\b/i;

export class MockJourneyAIProvider implements JourneyAIProvider {
  readonly name = "mock";
  readonly isMock = true;

  async respond(request: JourneyAIRequest): Promise<JourneyAIResponse> {
    const stage = request.stage;
    const reply = stage ? this.replyForStage(stage, request) : this.completed(request.snapshot);
    return { ...reply, currentStage: stage ?? "EVIDENCE_PLAN" };
  }

  private replyForStage(stage: JourneyStageKey, req: JourneyAIRequest): Reply {
    const { input } = req;
    const isDecisionEvent = input.kind === "EVENT";
    // Uma nova mensagem reformula a formulação do impacto ainda pendente.
    const isImpactReformulation = stage === "IMPACT" && !req.snapshot.impact && input.kind === "MESSAGE";
    // Enquanto houver proposta pendente, uma decisão por vez.
    if (
      req.pendingProposal &&
      !isDecisionEvent &&
      !isImpactReformulation &&
      !(input.kind === "ACTION" && input.actionId === "show-examples")
    ) {
      return remindPending();
    }
    switch (stage) {
      case "CONTEXT":
        return this.context(req);
      case "ACTIVITIES":
        return this.activities(req);
      case "OUTCOMES":
        return this.outcomes(req);
      case "IMPACT":
        return this.impact(req);
      case "EVIDENCE_PLAN":
        return this.evidencePlan(req);
    }
  }

  // -------------------------------------------------------------------------
  // Etapa 1 — Contexto
  // -------------------------------------------------------------------------

  private context(req: JourneyAIRequest): Reply {
    const { project } = req.snapshot;
    const editAction = navigateAction(`/projetos/${project.id}/editar`, "Editar", "EDIT");
    if (req.input.kind === "MESSAGE") {
      return say(
        "Para ajustar o contexto, use **Editar**: o formulário do projeto abre com as informações atuais. Se estiver tudo certo, aprove a etapa.",
        [approveStageAction("Aprovar"), editAction],
      );
    }
    return say(
      `Olá! Sou o consultor virtual da Jornada de Impacto. Vamos organizar juntos a lógica de impacto do projeto **${project.name}**.\n\n` +
        `${stageTitle("CONTEXT")}. O resumo do que vocês registraram está no painel “Resumo do projeto”. Confira se o público, o território e o problema estão claros.\n\n` +
        "Se estiver tudo certo, aprove o contexto para começarmos pelas atividades.",
      [approveStageAction("Aprovar"), editAction],
    );
  }

  // -------------------------------------------------------------------------
  // Etapa 2 — Atividades ofertadas
  // -------------------------------------------------------------------------

  private activities(req: JourneyAIRequest): Reply {
    const { snapshot, input, state } = req;
    const { activities } = snapshot;
    const draft = state?.kind === "ACTIVITY_DRAFT" ? state : null;
    const nextIndex = activities.findIndex((a) => !isActivityComplete(a));
    const nextOrFinish: JourneyAIAction[] = [
      { id: "add-activity", label: "Acrescentar atividade", intent: "ADD" },
      { id: "finish-activities", label: "Concluir atividades", intent: "CONTINUE" },
    ];

    if (input.kind === "ACTION") {
      switch (input.actionId) {
        case "add-activity":
          return say("Qual atividade deseja acrescentar à lista? Descreva a ação concreta que a equipe realizará.", [], {
            state: null,
          });
        case "meta-complete":
          if (draft?.target) return this.activityForm(snapshot, draft.description, draft.target, draft.activityId);
          break;
        case "finish-activities":
          if (nextIndex === -1 && activities.length > 0) {
            const synthesis = activities
              .map((a, i) => `**Atividade ${twoDigits(i + 1)}**\n${linesToText(activityLines(a))}`)
              .join("\n\n");
            return say(
              `Síntese da ${stageTitle("ACTIVITIES")}:\n\n${synthesis}\n\nPara ajustar alguma atividade, use **Editar** no painel de resumo. Se estiver tudo certo, aprove a etapa.`,
              [approveStageAction(), nextOrFinish[0]],
              { state: { kind: "ACTIVITIES_REVIEW" } },
            );
          }
          break;
      }
    }

    if (input.kind === "MESSAGE") {
      // 2.3: resposta sobre o que será ofertado → ficha da atividade da lista.
      if (draft?.step === "ASK_TARGET") {
        // Meta já informada + "não há mais nada" → segue só com o que foi dito.
        const target = !draft.target ? input.text : NOTHING_TO_ADD.test(input.text.trim()) ? draft.target : `${draft.target}; ${input.text}`;
        return this.activityForm(snapshot, draft.description, target, draft.activityId);
      }
      // 2.1: mapeamento — a mensagem traz atividades novas para a lista.
      const items = splitActivities(input.text);
      for (const item of items) {
        const assessment = assessActivityDescription(item);
        if (!assessment.ok) return say(assessment.message, [], { state: null });
      }
      const listed = items.map((item) => ({ description: stripTrailingPeriod(formulateActivity(item)) }));
      const start = activities.length;
      const text = listed.map((a, i) => `**Atividade ${twoDigits(start + i + 1)}:** ${a.description}`).join("\n");
      return propose(
        `Organizei ${listed.length === 1 ? "a atividade" : "as atividades"} em formulações completas:\n\n${text}\n\nVocês podem aprovar, editar, excluir ou acrescentar atividades. Depois detalhamos uma por vez.`,
        { type: "ACTIVITY", payload: { step: "LIST", activities: listed } },
      );
    }

    const rejected = input.kind === "EVENT" && input.event === "PROPOSAL_REJECTED";
    // 2.1 ainda não feito: começa pelo mapeamento.
    if (activities.length === 0) {
      if (rejected) {
        return say("Lista descartada. O que a equipe realizará para colocar a estratégia em prática?", [], { state: null });
      }
      const opening =
        input.kind === "EVENT" && input.event === "STAGE_APPROVED"
          ? `A Etapa 1 — Contexto do projeto está aprovada.\n\nAgora iniciamos a ${stageTitle("ACTIVITIES")}. `
          : "";
      return say(
        `${opening}Agora vamos listar as ações práticas do projeto. O que a equipe realizará para colocar essa estratégia em prática?\n\n` +
          "Por exemplo: ofertar capacitações técnicas, realizar visitas de acompanhamento, fornecer insumos, desenvolver materiais de apoio ou promover encontros entre participantes.",
        [],
        { state: null },
      );
    }

    // 2.2: detalha a próxima atividade da lista ainda sem ficha.
    if (nextIndex !== -1) {
      const prefix = rejected ? "Ficha descartada. Vamos refazê-la.\n\n" : "";
      return this.askActivityTarget(activities[nextIndex], nextIndex, prefix);
    }
    return say(
      `Todas as atividades da lista foram detalhadas. Deseja acrescentar outra atividade ou concluir esta etapa?`,
      nextOrFinish,
      { state: null },
    );
  }

  /** Etapa 2.2: apresenta a atividade e pergunta o que será ofertado (ou confirma a meta já informada). */
  private askActivityTarget(activity: ActivityView, index: number, prefix = ""): Reply {
    const description = stripTrailingPeriod(activity.description);
    const header = `${prefix}**Atividade ${twoDigits(index + 1)}:** ${description}`;
    const hasTarget = extractQuantity(description) || extractDurationMonths(description) || extractDeadline(description);
    if (hasTarget) {
      return say(
        `${header}\n\n**Meta informada:** ${description}\n\nDesejam acrescentar mais alguma informação à meta (quantidade, público, carga horária ou período)? Se estiver completa, é só confirmar.`,
        [{ id: "meta-complete", label: "A meta está completa", intent: "CONTINUE" }],
        { state: { kind: "ACTIVITY_DRAFT", step: "ASK_TARGET", description, target: description, activityId: activity.id } },
      );
    }
    return say(`${header}\n\n${activityTargetQuestion(description)}`, [], {
      state: { kind: "ACTIVITY_DRAFT", step: "ASK_TARGET", description, activityId: activity.id },
    });
  }

  /** Ficha da atividade com a meta informada e indicadores sugeridos. */
  private activityForm(snapshot: JourneySnapshot, description: string, targetText: string, activityId?: string | null): Reply {
    const { unit } = audienceShort(snapshot.project.targetAudience);
    const payload: ActivityPayload = { activityId: activityId ?? null, ...buildActivityPayload(description, targetText, unit) };
    return propose(
      "Preparei a ficha da atividade com a meta que vocês informaram e uma sugestão de indicadores e meios de verificação. Revise, edite se precisar e aprove.",
      { type: "ACTIVITY", payload },
    );
  }

  private outcomes(req: JourneyAIRequest): Reply {
    const { snapshot, input } = req;
    const { project, activities, outcomes } = snapshot;
    const { unit } = audienceShort(project.targetAudience);

    if (outcomes.length === 0) {
      const regenerate = input.kind === "ACTION" && input.actionId === "regenerate-outcomes";
      if (input.kind === "EVENT" && input.event === "PROPOSAL_REJECTED") {
        return say(
          "Sugestões descartadas. Descreva, com suas palavras, uma mudança que vocês esperam observar no público ao final do projeto, ou peça novas sugestões.",
          [{ id: "regenerate-outcomes", label: "Gerar novas sugestões", intent: "CONTINUE" }],
        );
      }
      if (input.kind === "MESSAGE") {
        const payload: OutcomePayload = {
          step: "STATEMENTS",
          outcomes: [{ statement: stripTrailingPeriod(input.text), relatedActivityIds: activities.map((a) => a.id) }],
          explicitRequestForMore: false,
        };
        return propose(
          "Registrei a mudança como vocês descreveram. Indique, na edição, quais atividades sustentam essa mudança e aprove.",
          { type: "OUTCOME", payload },
        );
      }
      const suggestions = suggestOutcomes(activities, project.targetAudience, `${project.problem} ${project.strategy ?? ""}`);
      const countWord = ["", "uma mudança", "duas mudanças", "três mudanças"][suggestions.length] ?? `${suggestions.length} mudanças`;
      const verb = suggestions.length === 1 ? "esta é" : "estas são";
      const text = suggestions.map((s, i) => outcomeSuggestionText(i, s, activities)).join("\n\n");
      const opening = regenerate
        ? `Considerando as atividades que criamos, ${verb} ${countWord} que sugiro acompanhar no projeto.`
        : `A Etapa 2 — Atividades e Resultados está aprovada.\n\nAgora iniciamos a ${stageTitle("OUTCOMES")}. Considerando as atividades que criamos, ${verb} ${countWord} que sugiro acompanhar no projeto.`;
      const payload: OutcomePayload = {
        step: "STATEMENTS",
        outcomes: suggestions.map((s) => ({ statement: s.statement, relatedActivityIds: s.relatedActivityIds })),
        explicitRequestForMore: false,
      };
      return propose(`${opening}\n\n${text}\n\nVocês podem editar, excluir ou aprovar essas mudanças.`, {
        type: "OUTCOME",
        payload,
      });
    }

    const index = outcomes.findIndex((o) => outcomeNextStep(o) !== null);
    if (index === -1) return this.outcomesSynthesis(snapshot);
    const outcome = outcomes[index];
    const step = outcomeNextStep(outcome);

    if (step === "TARGET") {
      if (input.kind === "MESSAGE") {
        // Com a meta informada, a ficha completa do resultado vem de uma vez.
        const suggestion = suggestOutcomeIndicator(outcome.description, unit);
        const payload: OutcomePayload = {
          step: "DETAIL",
          outcomeId: outcome.id,
          target: upperFirst(stripTrailingPeriod(input.text.trim())),
          indicators: [{ name: suggestion.name, explanation: suggestion.explanation }],
          verification: suggestion.verification,
        };
        return propose(
          `Resultado ${twoDigits(index + 1)}: organizei a meta informada com o indicador e a verificação sugeridos. Você pode aprovar, editar, excluir ou acrescentar informações.`,
          { type: "OUTCOME", payload },
        );
      }
      return say(this.targetQuestion(outcome, index, project.targetAudience, unit));
    }

    // step === "INDICATOR": sugerido automaticamente após a meta.
    const suggestion = suggestOutcomeIndicator(outcome.description, unit);
    const verification = input.kind === "MESSAGE" ? upperFirst(stripTrailingPeriod(input.text)) : suggestion.verification;
    if (input.kind === "EVENT" && input.event === "PROPOSAL_REJECTED") {
      return say(
        `Sugestão descartada. Como vocês preferem verificar o Resultado ${twoDigits(index + 1)}? Descreva em poucas palavras ou peça uma nova sugestão.`,
        [{ id: "regenerate-indicator", label: "Gerar nova sugestão", intent: "CONTINUE" }],
      );
    }
    const payload: OutcomePayload = {
      step: "INDICATOR",
      outcomeId: outcome.id,
      indicators: [{ name: suggestion.name, explanation: suggestion.explanation }],
      verification,
    };
    return propose(
      `Meta do Resultado ${twoDigits(index + 1)} aprovada. Para acompanhar essa mudança, sugiro o indicador e a forma de verificação abaixo. Os instrumentos e responsáveis serão detalhados no plano de evidências.`,
      { type: "OUTCOME", payload },
    );
  }

  private targetQuestion(outcome: OutcomeView, index: number, targetAudience: string, unit: string): string {
    const predicate = outcomePredicate(outcome.description, targetAudience) ?? "alcancem essa mudança";
    return (
      "Vamos definir a meta para este resultado.\n\n" +
      `Resultado ${twoDigits(index + 1)}: ${stripTrailingPeriod(outcome.description)}\n\n` +
      "Quanto do público vocês esperam que alcance essa mudança até o final do projeto?\n\n" +
      `Sugestão de meta: até o final do projeto, [X% ou X ${unit}] ${stripTrailingPeriod(predicate)}.\n\n` +
      "Informe o número ou percentual que consideram realista."
    );
  }

  private outcomesSynthesis(snapshot: JourneySnapshot): Reply {
    const synthesis = snapshot.outcomes
      .map((o, i) => `**Resultado ${twoDigits(i + 1)}**\n${linesToText(outcomeLines(o))}`)
      .join("\n\n");
    return say(
      `Síntese da ${stageTitle("OUTCOMES")}:\n\n${synthesis}\n\nPara ajustar algum resultado, use **Editar** no painel de resumo. Se estiver tudo certo, aprove a etapa.`,
      [approveStageAction()],
      { state: { kind: "OUTCOMES_REVIEW" } },
    );
  }

  // -------------------------------------------------------------------------
  // Etapa 4 — Impacto de longo prazo
  // -------------------------------------------------------------------------

  private impact(req: JourneyAIRequest): Reply {
    const { snapshot, input, state } = req;
    const impact = snapshot.impact;
    const { unit } = audienceShort(snapshot.project.targetAudience);

    if (!impact) {
      if (input.kind === "MESSAGE") {
        const statement = formulateImpact(input.text);
        const risky = findExclusiveCausalityTerms(statement);
        const payload: ImpactPayload = { step: "STATEMENT", statement };
        const note = risky.length
          ? `\n\nAtenção: o trecho “${risky.join("”, “")}” sugere que o projeto resolverá o problema sozinho. Ajuste a formulação para expressar contribuição antes de aprovar.`
          : "";
        return propose(`Formulei o impacto como contribuição do projeto. Revise e aprove.${note}`, { type: "IMPACT", payload });
      }
      if (input.kind === "EVENT" && input.event === "PROPOSAL_REJECTED") {
        return say("Formulação descartada. Como vocês descreveriam, em uma ou duas frases, a transformação de longo prazo para a qual o projeto contribui?");
      }
      return say(
        `A Etapa 3 — Resultados de Médio Prazo está aprovada.\n\nAgora iniciamos a ${stageTitle("IMPACT")}.\n\n` +
          "O impacto é a transformação maior para a qual o projeto contribui, mesmo depois do fim das atividades. Ele não é uma promessa de resolver sozinho um problema complexo.\n\n" +
          "Em uma ou duas frases: para qual transformação de longo prazo, na vida do público ou no território, o projeto quer contribuir?",
      );
    }

    if (!impact.followUpOption) {
      if (input.kind === "ACTION") {
        if (input.actionId === "show-examples") return say(IMPACT_EXAMPLES, IMPACT_OPTION_ACTIONS);
        if (input.actionId === "impact-option:VISION_ONLY") {
          const payload: ImpactPayload = { step: "FOLLOW_UP", option: "VISION_ONLY", followUps: [] };
          return propose(
            "Registraremos o impacto como visão de longo prazo do projeto, sem criar nova meta ou acompanhamento posterior. Confirme abaixo.",
            { type: "IMPACT", payload },
          );
        }
        if (input.actionId === "impact-option:FOLLOW_UP_CHANGE") {
          return say(
            "Qual mudança vocês desejam verificar depois do encerramento? Se já souberem, informem também a meta e quanto tempo após o fim do projeto querem verificar (por exemplo, 12 meses).",
            [],
            { state: { kind: "IMPACT_FOLLOW_UP_DRAFT", option: "FOLLOW_UP_CHANGE" } },
          );
        }
        if (input.actionId === "impact-option:FUTURE_EVALUATION") {
          return say(
            "O que vocês gostariam de avaliar no futuro e em que período após o encerramento do projeto?",
            [],
            { state: { kind: "IMPACT_FOLLOW_UP_DRAFT", option: "FUTURE_EVALUATION" } },
          );
        }
      }
      if (input.kind === "MESSAGE" && state?.kind === "IMPACT_FOLLOW_UP_DRAFT") {
        const followUp = state.option === "FOLLOW_UP_CHANGE"
          ? {
              description: upperFirst(stripTrailingPeriod(input.text)),
              target: null,
              indicator: `Percentual de ${unit} que mantêm a mudança após o encerramento`,
              verification: "Relatório de acompanhamento pós-projeto",
              periodAfterEnd: extractPeriodAfterEnd(input.text),
              notes: null,
            }
          : {
              description: upperFirst(stripTrailingPeriod(input.text)),
              target: null,
              indicator: null,
              verification: "Relatório de avaliação de impacto",
              periodAfterEnd: extractPeriodAfterEnd(input.text),
              notes: "Depende de equipe e recursos disponíveis após o encerramento.",
            };
        const payload: ImpactPayload = { step: "FOLLOW_UP", option: state.option, followUps: [followUp] };
        return propose(
          "Montei a ficha de acompanhamento. A meta ficou “a definir” porque não foi informada; vocês podem preenchê-la em **Editar**. Revise e aprove.",
          { type: "IMPACT", payload },
        );
      }
      return say(this.impactApprovedText(impact.statement), IMPACT_OPTION_ACTIONS, { state: null });
    }

    // Impacto e forma de acompanhamento definidos: síntese da etapa.
    const optionLabel = {
      VISION_ONLY: "Mantido como visão de longo prazo",
      FOLLOW_UP_CHANGE: "Acompanhar uma mudança depois do projeto",
      FUTURE_EVALUATION: "Planejar uma avaliação futura",
    }[impact.followUpOption];
    const followUps = impact.followUps
      .map((f) => `• ${stripTrailingPeriod(f.description)}${f.periodAfterEnd ? ` (${f.periodAfterEnd})` : ""}`)
      .join("\n");
    return say(
      `Síntese da ${stageTitle("IMPACT")}:\n\nImpacto de longo prazo: ${stripTrailingPeriod(impact.statement)}.\nAcompanhamento: ${optionLabel}.${followUps ? `\n${followUps}` : ""}\n\nSe estiver tudo certo, aprove a etapa.`,
      [approveStageAction()],
      { state: { kind: "IMPACT_REVIEW" } },
    );
  }

  private impactApprovedText(statement: string): string {
    return (
      "**Impacto de longo prazo**\n" +
      "A formulação do impacto de longo prazo foi aprovada:\n\n" +
      `${stripTrailingPeriod(statement)}.\n\n` +
      "O impacto do projeto representa a transformação maior para a qual ele contribui a longo prazo, inclusive após o encerramento das atividades. É quando as mudanças iniciadas pelo projeto permanecem vivas na vida das pessoas, na comunidade ou no território.\n\n" +
      "Agora, precisamos decidir:\n\n" +
      "Depois que as atividades terminarem, vocês desejam acompanhar alguma mudança que permaneceu na vida das famílias ou no território a longo prazo?\n\n" +
      "1. **Manter como visão de longo prazo** — Registramos essa transformação como o horizonte do projeto, sem criar nova meta ou acompanhamento posterior.\n" +
      "2. **Acompanhar uma mudança depois do projeto** — Escolhemos uma ou mais metas simples para verificar após o encerramento, como famílias que mantêm os quintais produtivos ou continuam utilizando canais de comercialização.\n" +
      "3. **Planejar uma avaliação futura** — Registramos o que gostaríamos de avaliar e em que período, caso a organização tenha equipe e recursos para acompanhar o impacto posteriormente."
    );
  }

  // -------------------------------------------------------------------------
  // Etapa 5 — Plano de evidências
  // -------------------------------------------------------------------------

  private evidencePlan(req: JourneyAIRequest): Reply {
    const { snapshot, input } = req;
    const planPath = `/projetos/${snapshot.project.id}/plano-de-evidencias`;

    // Por ora a jornada termina no impacto: em vez de consolidar o plano, o
    // consultor aponta o resumo. O fluxo abaixo fica pronto para ser religado.
    if (snapshot.evidencePlan.length === 0) {
      return say(
        "A Etapa 4 — Impacto de longo prazo está aprovada.\n\nO resumo com tudo o que construímos — contexto, atividades e resultados, resultados de médio prazo e impacto — está pronto na tela principal.",
        [],
        { state: null },
      );
    }

    if (snapshot.evidencePlan.length > 0) {
      return say(
        "Plano de evidências registrado. Na página do plano, vocês podem detalhar cada linha: quando coletar, quem registrará, o instrumento necessário e as pendências. Quando estiver pronto, aprove a etapa para concluir a jornada.",
        [navigateAction(planPath, "Abrir plano de evidências"), approveStageAction("Aprovar etapa")],
        { state: null },
      );
    }
    if (input.kind === "EVENT" && input.event === "PROPOSAL_REJECTED") {
      return say("Consolidação descartada. Quando quiserem, gero novamente o plano a partir do que foi aprovado.", [
        { id: "regenerate-plan", label: "Gerar plano novamente", intent: "CONTINUE" },
      ]);
    }
    const items = consolidateEvidencePlan(snapshot).map((item) => ({
      sourceType: item.sourceType,
      sourceId: item.sourceId,
      sourceLabel: item.sourceLabel,
      target: item.target,
      indicator: item.indicator,
      verification: item.verification,
      collectionTiming: item.collectionTiming,
      responsible: item.responsible,
      instrument: item.instrument,
      pending: item.pending,
    }));
    const payload: EvidencePlanPayload = { items };
    return propose(
      `A Etapa 4 — Impacto de longo prazo está aprovada.\n\nAgora iniciamos a ${stageTitle("EVIDENCE_PLAN")}. Consolidei, em uma única tabela, as metas, indicadores e meios de verificação já aprovados. Para cada linha sugeri quando coletar e o instrumento necessário; quem registrará fica “a definir”.\n\nRevise e aprove para registrar o plano.`,
      { type: "EVIDENCE_PLAN", payload },
    );
  }

  private completed(snapshot: JourneySnapshot): Reply {
    return say(
      `A Jornada de Impacto do projeto **${snapshot.project.name}** está concluída. O Relatório Geral reúne o contexto, as atividades, os resultados de médio prazo, o impacto de longo prazo e o plano de evidências.`,
      [
        navigateAction(`/projetos/${snapshot.project.id}/relatorio`, "Ver relatório geral"),
        navigateAction(`/projetos/${snapshot.project.id}/plano-de-evidencias`, "Abrir plano de evidências"),
      ],
      { state: null },
    );
  }
}

/** Exemplos ilustrativos — nunca inseridos automaticamente no projeto. */
export const IMPACT_EXAMPLES =
  "Exemplos ilustrativos (nada aqui é registrado no projeto):\n\n" +
  "**1. Manter como visão de longo prazo**\n" +
  "• O que fica registrado: a frase do impacto como horizonte do projeto.\n" +
  "• Meta: não se aplica.\n" +
  "• Prazo para avaliar: não se aplica.\n" +
  "• Meio de verificação: não se aplica.\n\n" +
  "**2. Acompanhar uma mudança depois do projeto**\n" +
  "• O que fica registrado: famílias que mantêm os quintais produtivos após o fim das atividades.\n" +
  "• Meta possível: metade das famílias participantes mantém o quintal produtivo.\n" +
  "• Prazo recomendado: 12 meses após o encerramento.\n" +
  "• Meio de verificação: visita ou contato com uma amostra das famílias, registrado em relatório simples.\n\n" +
  "**3. Planejar uma avaliação futura**\n" +
  "• O que fica registrado: avaliar se a renda com a comercialização se manteve no território.\n" +
  "• Meta possível: definida no desenho da avaliação.\n" +
  "• Prazo recomendado: 2 a 3 anos após o encerramento.\n" +
  "• Meio de verificação: avaliação com entrevistas ou questionário, se houver equipe e recursos.\n\n" +
  "Qual opção faz mais sentido para o projeto?";
