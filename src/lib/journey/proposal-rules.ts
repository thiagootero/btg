/**
 * Regras metodológicas aplicadas às propostas (e às edições de conteúdo
 * aprovado) antes de qualquer gravação. Funções puras sobre o snapshot.
 */
import { durationText, twoDigits } from "@/lib/journey/format";
import { outcomeNextStep } from "@/lib/journey/progress";
import { isActivityList } from "@/lib/journey/proposal-schemas";
import type {
  ActivityPayload,
  ImpactFollowUpInput,
  OutcomePayload,
  TypedProposal,
} from "@/lib/journey/proposal-schemas";
import {
  assessActivityDescription,
  findAbstractOutcomeTerms,
  findExclusiveCausalityTerms,
  findUnsupportedOutcomeDependency,
  isActivityOnlyEvidence,
  MAX_OUTCOMES,
  MAX_OUTCOMES_WITH_EXPLICIT_REQUEST,
} from "@/lib/journey/rules";
import type { JourneySnapshot } from "@/lib/journey/types";

export interface RuleIssue {
  field: string;
  message: string;
}

type ProjectPeriod = Pick<JourneySnapshot["project"], "durationMonths">;

/**
 * Coerência temporal: a atividade pode durar menos que o projeto, nunca mais;
 * atividade declarada antes do início ou depois do encerramento exige
 * esclarecimento. Comparação numérica sobre os campos estruturados da meta.
 */
export function checkActivityTiming(target: ActivityPayload["target"], project: ProjectPeriod): RuleIssue[] {
  const projectDuration = durationText(project.durationMonths);
  if (target.period === "BEFORE_PROJECT" || target.period === "AFTER_PROJECT") {
    const when = target.period === "AFTER_PROJECT" ? "depois do encerramento" : "antes do início";
    return [
      {
        field: "target.period",
        message: `A atividade foi prevista para ${when} do projeto, que tem duração de ${projectDuration}. Ajuste a meta para o período do projeto ou esclareça como essa etapa se relaciona com ele.`,
      },
    ];
  }
  if (target.durationMonths !== null && target.durationMonths > project.durationMonths) {
    return [
      {
        field: "target.durationMonths",
        message: `A atividade foi prevista para ${durationText(target.durationMonths)}, mas o projeto tem duração de ${projectDuration}. A atividade pode durar menos que o projeto, mas não mais.`,
      },
    ];
  }
  return [];
}

/**
 * Mensagem do consultor quando a ficha proposta é incoerente com a duração do
 * projeto: a ficha não é apresentada e a pessoa escolhe como ajustar.
 */
export function activityTimingClarification(target: ActivityPayload["target"], project: ProjectPeriod): string | null {
  if (checkActivityTiming(target, project).length === 0) return null;
  const months = durationText(project.durationMonths);
  if (target.period === "BEFORE_PROJECT" || target.period === "AFTER_PROJECT") {
    const when = target.period === "AFTER_PROJECT" ? "depois do encerramento" : "antes do início";
    return [
      `Preciso de um esclarecimento: a atividade foi descrita como ${when} do projeto, que tem duração de ${months}.`,
      "",
      "Vocês desejam:",
      `1. realizar a atividade dentro dos ${months} do projeto;`,
      "2. revisar a duração geral do projeto;",
      `3. explicar como essa etapa ${target.period === "AFTER_PROJECT" ? "posterior" : "anterior"} se relaciona com o projeto?`,
    ].join("\n");
  }
  return [
    `Há uma inconsistência a ajustar: o projeto tem duração de ${months}, mas a atividade foi prevista para ${durationText(target.durationMonths)}.`,
    "",
    "Vocês desejam:",
    `1. realizar a atividade durante os ${months} do projeto;`,
    "2. revisar a duração geral do projeto;",
    "3. esclarecer se existe alguma etapa anterior ou posterior ao período oficial?",
  ].join("\n");
}

export function checkActivity(payload: ActivityPayload, project: ProjectPeriod): RuleIssue[] {
  const assessment = assessActivityDescription(payload.description);
  return [
    ...(assessment.ok ? [] : [{ field: "description", message: assessment.message }]),
    ...checkActivityTiming(payload.target, project),
  ];
}

export function checkOutcomeStatement(
  statement: string,
  relatedActivityIds: string[],
  snapshot: JourneySnapshot,
  field: string,
): RuleIssue[] {
  const issues: RuleIssue[] = [];
  const abstract = findAbstractOutcomeTerms(statement);
  if (abstract.length) {
    issues.push({
      field,
      message: `Evite termos abstratos como “${abstract.join("”, “")}”. Descreva uma mudança que possa ser observada (ex.: passar a utilizar, ampliar, passar a acessar).`,
    });
  }
  const known = new Set(snapshot.activities.map((a) => a.id));
  const unknown = relatedActivityIds.filter((id) => !known.has(id));
  if (unknown.length) {
    issues.push({ field, message: "A mudança está relacionada a uma atividade que não existe neste projeto." });
  }
  const related = snapshot.activities.filter((a) => relatedActivityIds.includes(a.id)).map((a) => a.description);
  const dependency = findUnsupportedOutcomeDependency(statement, related);
  if (dependency) issues.push({ field, message: dependency });
  return issues;
}

export function checkOutcomeVerification(verification: string, field: string): RuleIssue[] {
  return isActivityOnlyEvidence(verification)
    ? [
        {
          field,
          message:
            "Foto, lista de presença ou relatório de execução comprovam a atividade, mas não a mudança na vida das pessoas. Indique uma forma de verificar a mudança (ex.: relatório de evolução das famílias).",
        },
      ]
    : [];
}

export function checkOutcome(payload: OutcomePayload, snapshot: JourneySnapshot): RuleIssue[] {
  const issues: RuleIssue[] = [];
  if (payload.step === "STATEMENTS") {
    const limit = payload.explicitRequestForMore ? MAX_OUTCOMES_WITH_EXPLICIT_REQUEST : MAX_OUTCOMES;
    const total = snapshot.outcomes.length + payload.outcomes.length;
    if (total > limit) {
      issues.push({
        field: "outcomes",
        message: payload.explicitRequestForMore
          ? `O limite é de ${MAX_OUTCOMES_WITH_EXPLICIT_REQUEST} resultados de médio prazo por projeto.`
          : `Priorize até ${MAX_OUTCOMES} mudanças de médio prazo. Se precisarem de mais, marquem a solicitação expressa.`,
      });
    }
    payload.outcomes.forEach((o, i) => {
      issues.push(...checkOutcomeStatement(o.statement, o.relatedActivityIds, snapshot, `outcomes.${i}.statement`));
    });
    return issues;
  }

  const index = snapshot.outcomes.findIndex((o) => o.id === payload.outcomeId);
  if (index === -1) return [{ field: "outcomeId", message: "Resultado não encontrado neste projeto." }];
  const outcome = snapshot.outcomes[index];

  if (payload.step === "DETAIL") {
    issues.push(...checkOutcomeVerification(payload.verification, "verification"));
  }

  if (payload.step === "INDICATOR") {
    if (outcomeNextStep(outcome) === "TARGET") {
      issues.push({
        field: "outcomeId",
        message: `Defina e aprove a meta do Resultado ${twoDigits(index + 1)} antes do indicador.`,
      });
    }
    issues.push(...checkOutcomeVerification(payload.verification, "verification"));
  }
  return issues;
}

export function checkImpactStatement(statement: string, field = "statement"): RuleIssue[] {
  const terms = findExclusiveCausalityTerms(statement);
  return terms.length
    ? [
        {
          field,
          message: `Formule o impacto como contribuição de longo prazo, sem prometer resolver sozinho o problema (revise: “${terms.join("”, “")}”).`,
        },
      ]
    : [];
}

export function checkFollowUps(followUps: ImpactFollowUpInput[]): RuleIssue[] {
  return followUps.flatMap((f, i) =>
    f.verification ? checkOutcomeVerification(f.verification, `followUps.${i}.verification`) : [],
  );
}

/** Verifica uma proposta tipada contra as regras e o estado atual do projeto. */
export function checkProposal(proposal: TypedProposal, snapshot: JourneySnapshot): RuleIssue[] {
  switch (proposal.type) {
    case "ACTIVITY": {
      const payload = proposal.payload;
      if (isActivityList(payload)) {
        return payload.activities.flatMap((a, i) => {
          const assessment = assessActivityDescription(a.description);
          return assessment.ok ? [] : [{ field: `activities.${i}.description`, message: assessment.message }];
        });
      }
      if (payload.activityId && !snapshot.activities.some((a) => a.id === payload.activityId)) {
        return [{ field: "activityId", message: "Atividade não encontrada neste projeto." }];
      }
      return checkActivity(payload, snapshot.project);
    }
    case "OUTCOME":
      return checkOutcome(proposal.payload, snapshot);
    case "IMPACT":
      if (proposal.payload.step === "STATEMENT") return checkImpactStatement(proposal.payload.statement);
      if (!snapshot.impact) return [{ field: "option", message: "Aprove a formulação do impacto antes de escolher o acompanhamento." }];
      return checkFollowUps(proposal.payload.followUps);
    case "EVIDENCE_PLAN": {
      const valid = new Set([
        ...snapshot.activities.map((a) => `ACTIVITY:${a.id}`),
        ...snapshot.outcomes.map((o) => `OUTCOME:${o.id}`),
        ...(snapshot.impact?.followUps ?? []).map((f) => `IMPACT:${f.id}`),
      ]);
      const unknown = proposal.payload.items.filter((i) => !valid.has(`${i.sourceType}:${i.sourceId}`));
      return unknown.length
        ? [{ field: "items", message: "O plano faz referência a itens que não foram aprovados nas etapas anteriores." }]
        : [];
    }
  }
}
