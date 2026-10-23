export const JOURNEY_STAGES = ["CONTEXT", "ACTIVITIES", "OUTCOMES", "IMPACT", "EVIDENCE_PLAN"] as const;

export type JourneyStageKey = (typeof JOURNEY_STAGES)[number];

export const STAGE_LABELS: Record<JourneyStageKey, string> = {
  CONTEXT: "Contexto do projeto",
  ACTIVITIES: "Atividades e Resultados",
  OUTCOMES: "Resultados de Médio Prazo",
  IMPACT: "Impacto de longo prazo",
  EVIDENCE_PLAN: "Plano de evidências",
};

export const STAGE_SHORT_LABELS: Record<JourneyStageKey, string> = {
  CONTEXT: "Contexto",
  ACTIVITIES: "Atividades e Resultados",
  OUTCOMES: "Resultados de Médio Prazo",
  IMPACT: "Impacto de longo prazo",
  EVIDENCE_PLAN: "Plano de evidências",
};

/**
 * Por ora a jornada termina no impacto: o plano de evidências sai do passo a
 * passo e, no lugar dele, aparece o resumo de tudo o que foi construído.
 */
export const VISIBLE_STAGES = JOURNEY_STAGES.filter((s) => s !== "EVIDENCE_PLAN");

/** Passo exibido no centro da jornada: uma etapa ou o resumo final. */
export type JourneyStep = JourneyStageKey | "SUMMARY";

/** O resumo é liberado quando todas as etapas visíveis foram aprovadas. */
export function summaryReady(approved: Iterable<JourneyStageKey>): boolean {
  const set = new Set(approved);
  return VISIBLE_STAGES.every((s) => set.has(s));
}

export function stageNumber(stage: JourneyStageKey): number {
  return JOURNEY_STAGES.indexOf(stage) + 1;
}

export function stageTitle(stage: JourneyStageKey): string {
  return `Etapa ${stageNumber(stage)} — ${STAGE_LABELS[stage]}`;
}

export function previousStages(stage: JourneyStageKey): JourneyStageKey[] {
  return JOURNEY_STAGES.slice(0, JOURNEY_STAGES.indexOf(stage));
}

export function laterStages(stage: JourneyStageKey): JourneyStageKey[] {
  return JOURNEY_STAGES.slice(JOURNEY_STAGES.indexOf(stage) + 1);
}

/** Etapa atual = primeira etapa ainda não aprovada (ou null se todas foram). */
export function currentStageFrom(approved: Iterable<JourneyStageKey>): JourneyStageKey | null {
  const set = new Set(approved);
  return JOURNEY_STAGES.find((s) => !set.has(s)) ?? null;
}

export type StageState = "approved" | "current" | "pending";

export function stageStates(approved: Iterable<JourneyStageKey>): Record<JourneyStageKey, StageState> {
  const set = new Set(approved);
  const current = currentStageFrom(set);
  return Object.fromEntries(
    JOURNEY_STAGES.map((s) => [s, set.has(s) ? "approved" : s === current ? "current" : "pending"]),
  ) as Record<JourneyStageKey, StageState>;
}
