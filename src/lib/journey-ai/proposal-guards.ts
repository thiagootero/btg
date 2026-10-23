import { ACTION_IDS, isProposalAction, PROPOSAL_ACTIONS } from "@/lib/journey/actions";
import { stripTrailingPeriod } from "@/lib/journey/format";
import { activityTimingClarification } from "@/lib/journey/proposal-rules";
import { stageApprovalBlockers } from "@/lib/journey/progress";
import { activityListPayloadSchema, activityPayloadSchema, PROPOSAL_STAGE } from "@/lib/journey/proposal-schemas";
import { stageTitle } from "@/lib/journey/stages";
import { isToDefine } from "@/lib/journey/rules";
import type { JourneySnapshot } from "@/lib/journey/types";
import type { JourneyAIResponse, JourneyConversationState } from "@/lib/journey-ai/response-schema";
import type { JourneyAIInput } from "@/lib/journey-ai/types";

/**
 * Regras de condução aplicadas pelo servidor à resposta de QUALQUER provedor,
 * antes de gravar: não dependem de o modelo seguir as instruções.
 */

/**
 * Coerência temporal: se a ficha de atividade proposta ultrapassa a duração do
 * projeto (ou ocorre antes/depois dele), ela é descartada e o consultor pede
 * ajuste. A ficha nunca chega a ser apresentada como válida e o rascunho volta
 * à pergunta da meta.
 */
export function enforceActivityTiming(response: JourneyAIResponse, snapshot: JourneySnapshot): JourneyAIResponse {
  if (response.proposal?.type !== "ACTIVITY") return response;
  const parsed = activityPayloadSchema.safeParse(response.proposal.payload);
  if (!parsed.success) return response;
  const clarification = activityTimingClarification(parsed.data.target, snapshot.project);
  if (!clarification) return response;
  return {
    message: clarification,
    currentStage: response.currentStage,
    actions: [],
    requiresApproval: false,
    state: {
      kind: "ACTIVITY_DRAFT",
      step: "ASK_TARGET",
      description: parsed.data.description,
      activityId: parsed.data.activityId ?? null,
    },
  };
}

export interface ActivityFlowContext {
  snapshot: JourneySnapshot;
  /** Rascunho ANTES deste turno. */
  state: JourneyConversationState | null;
  /** Tipo da proposta pendente antes deste turno, se houver. */
  pendingProposalType: string | null;
  /** O que motivou o turno: só uma mensagem da pessoa pode originar a lista (2.1). */
  inputKind: JourneyAIInput["kind"];
}

const META_COMPLETE_ACTION = { id: "meta-complete", label: "A meta está completa", intent: "CONTINUE" } as const;

const MAPPING_QUESTION =
  "Antes de detalhar metas, indicadores e meios de verificação, vamos listar as ações práticas do projeto. O que a equipe realizará para colocar essa estratégia em prática?";

function withoutDecisions(actions: JourneyAIResponse["actions"]) {
  return actions.filter(
    (a) => !isProposalAction(a.id) && a.id !== ACTION_IDS.APPROVE_STAGE && a.intent !== "ADD" && a.intent !== "CONTINUE",
  );
}

/** A mensagem do modelo só serve se já for uma pergunta, sem apresentar ficha. */
function isPlainQuestion(message: string) {
  return message.includes("?") && !/indicador|meio de verifica|verificação:/i.test(message);
}

/**
 * Ordem da Etapa 2, conforme as instruções do agente:
 *   2.1 lista de atividades (proposta LIST) →
 *   2.2 uma atividade por vez, perguntando o que será ofertado →
 *   2.3 ficha (meta, indicadores, verificação) da atividade da lista.
 * O servidor recusa fichas fora dessa ordem, qualquer que seja o provedor.
 */
export function enforceActivityFlow(response: JourneyAIResponse, context: ActivityFlowContext): JourneyAIResponse {
  if (response.proposal?.type !== "ACTIVITY") return response;
  // 2.1: a lista organiza o que a pessoa respondeu; nunca vem antes da resposta dela.
  if (activityListPayloadSchema.safeParse(response.proposal.payload).success) {
    if (context.inputKind === "MESSAGE") return response;
    return {
      currentStage: response.currentStage,
      requiresApproval: false,
      message: isPlainQuestion(response.message) ? response.message : MAPPING_QUESTION,
      actions: withoutDecisions(response.actions),
    };
  }
  const parsed = activityPayloadSchema.safeParse(response.proposal.payload);
  if (!parsed.success) return response; // formato inválido, tratado adiante
  const form = parsed.data;
  const { snapshot, state } = context;
  const draft = state?.kind === "ACTIVITY_DRAFT" ? state : null;
  const base = { currentStage: response.currentStage, requiresApproval: false } as const;

  // 2.1 ainda não feito: nenhuma ficha antes da lista de atividades.
  if (snapshot.activities.length === 0) {
    return {
      ...base,
      message: isPlainQuestion(response.message) && !/meta|quant/i.test(response.message) ? response.message : MAPPING_QUESTION,
      actions: withoutDecisions(response.actions),
      state: null,
    };
  }

  const activityId = form.activityId ?? draft?.activityId ?? null;
  const listed = activityId ? snapshot.activities.find((a) => a.id === activityId) : undefined;

  // Atividade fora da lista: primeiro ela entra na lista (2.1), depois é detalhada.
  if (!listed) {
    const description = stripTrailingPeriod(form.description);
    return {
      ...base,
      message: `Essa atividade ainda não está na lista do projeto. Proponho incluí-la:\n\n**Atividade:** ${description}\n\nDepois de aprovada, detalhamos o que será ofertado.`,
      proposal: { type: "ACTIVITY", payload: { step: "LIST", activities: [{ description }] } },
      actions: [...PROPOSAL_ACTIONS],
      requiresApproval: true,
      state: null,
    };
  }

  const withId = form.activityId ? response : { ...response, proposal: { type: "ACTIVITY" as const, payload: { ...form, activityId } } };
  // 2.2 já feito para esta atividade (pergunta do que será ofertado) ou revisão de ficha pendente.
  if (draft?.activityId === activityId || (draft && !draft.activityId) || context.pendingProposalType === "ACTIVITY") {
    return withId;
  }

  // Ficha antes da pergunta do que será ofertado: guarda a atividade e pergunta.
  const description = stripTrailingPeriod(listed.description);
  const informed = isToDefine(form.target.description) ? null : stripTrailingPeriod(form.target.description);
  const message = isPlainQuestion(response.message)
    ? response.message
    : informed
      ? `**Atividade:** ${description}\n\n**Meta informada:** ${informed}\n\nDesejam acrescentar mais alguma informação à meta (quantidade, público, carga horária ou período)? Se estiver completa, é só confirmar.`
      : `**Atividade:** ${description}\n\nPara esta atividade, o que será ofertado? Informe o que já estiver definido: quantidade, público e período.`;
  const actions = withoutDecisions(response.actions);
  return {
    ...base,
    message,
    actions: informed ? [...actions, META_COMPLETE_ACTION] : actions,
    state: { kind: "ACTIVITY_DRAFT", step: "ASK_TARGET", description, target: informed, activityId },
  };
}

/**
 * A etapa só muda quando a pessoa a aprova. Proposta de outra etapa (ex.: os
 * resultados enquanto as atividades não foram aprovadas) é descartada: se a
 * etapa atual está completa, o consultor pede a aprovação dela; se não, diz o
 * que falta.
 */
export function enforceCurrentStage(response: JourneyAIResponse, snapshot: JourneySnapshot): JourneyAIResponse {
  const stage = snapshot.currentStage;
  if (!response.proposal || !stage || PROPOSAL_STAGE[response.proposal.type] === stage) return response;
  const blockers = stageApprovalBlockers(snapshot, stage);
  if (blockers.length === 0) {
    return {
      message: `A ${stageTitle(stage)} está completa. A síntese está no painel ao lado. Se estiver tudo certo, aprove a etapa para seguirmos.`,
      currentStage: stage,
      actions: [{ id: ACTION_IDS.APPROVE_STAGE, label: "Aprovar etapa", intent: "APPROVE" }],
      requiresApproval: false,
      state: null,
    };
  }
  return {
    message: `Antes de seguir, ainda falta concluir a ${stageTitle(stage)}: ${blockers.join(" ")}`,
    currentStage: stage,
    actions: [],
    requiresApproval: false,
  };
}
