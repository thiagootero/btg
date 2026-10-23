import type { JourneyStageKey } from "@/lib/journey/stages";
import { currentStageFrom } from "@/lib/journey/stages";
import type { ActivityView, JourneySnapshot, OutcomeView } from "@/lib/journey/types";

export function activity(id: string, description: string, complete = true): ActivityView {
  return {
    id,
    order: Number(id.replace(/\D/g, "")) || 0,
    description,
    target: complete ? { description: "10 encontros com 20 famílias", deadline: "até o 6º mês", quantity: 10, unit: "encontros", durationMonths: null } : null,
    indicators: complete ? [{ name: "Número de encontros realizados", explanation: null }] : [],
    evidences: complete ? ["Lista de presença"] : [],
  };
}

export function outcome(id: string, description: string, overrides: Partial<OutcomeView> = {}): OutcomeView {
  return {
    id,
    order: 0,
    description,
    target: null,
    relatedActivityIds: ["a1"],
    indicators: [],
    evidences: [],
    ...overrides,
  };
}

export function snapshot(overrides: Partial<JourneySnapshot> & { approved?: JourneyStageKey[] } = {}): JourneySnapshot {
  const approved = overrides.approved ?? [];
  return {
    project: {
      id: "p1",
      organizationId: "org1",
      organizationName: "Organização Teste",
      name: "Projeto Teste",
      area: "INCLUSAO_PRODUTIVA",
      areaOther: null,
      areaLabel: "Inclusão produtiva",
      targetAudience: "Famílias agricultoras em situação de vulnerabilidade social",
      durationMonths: 12,
      startDate: null,
      problem: "Baixa produção de alimentos por falta de técnicas adaptadas ao semiárido.",
      strategy: "Combinar formação técnica, insumos e apoio à comercialização.",
      territories: [{ city: "Ninheira", state: "MG" }],
      isDemo: false,
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
    approvedStages: approved,
    currentStage: currentStageFrom(approved),
    activities: [],
    outcomes: [],
    impact: null,
    evidencePlan: [],
    ...overrides,
  };
}
