import type { ProjectAreaKey } from "@/lib/journey/areas";
import type { JourneyStageKey } from "@/lib/journey/stages";
import type { ImpactOption } from "@/lib/journey/proposal-schemas";

/**
 * Visão serializável do projeto e da jornada aprovada. É o que a interface,
 * o relatório e o provedor de IA recebem — nunca objetos do Prisma.
 */

export interface TerritoryView {
  city: string;
  state: string;
}

export interface ProjectContextView {
  id: string;
  organizationId: string;
  organizationName: string;
  name: string;
  area: ProjectAreaKey;
  areaOther: string | null;
  areaLabel: string;
  targetAudience: string;
  durationMonths: number;
  /** ISO (yyyy-mm-dd) ou null. */
  startDate: string | null;
  problem: string;
  /** Opcional: não é mais pedido no cadastro. */
  strategy: string | null;
  territories: TerritoryView[];
  isDemo: boolean;
  updatedAt: string;
}

export interface IndicatorView {
  name: string;
  explanation: string | null;
}

export interface ActivityView {
  id: string;
  order: number;
  description: string;
  target: {
    description: string;
    deadline: string | null;
    quantity: number | null;
    unit: string | null;
    /** Duração em meses; null = a definir. */
    durationMonths: number | null;
  } | null;
  indicators: IndicatorView[];
  evidences: string[];
}

export interface OutcomeView {
  id: string;
  order: number;
  description: string;
  target: string | null;
  relatedActivityIds: string[];
  indicators: IndicatorView[];
  evidences: string[];
}

export interface ImpactFollowUpView {
  id: string;
  description: string;
  target: string | null;
  indicator: string | null;
  verification: string | null;
  periodAfterEnd: string | null;
  notes: string | null;
}

export interface ImpactView {
  id: string;
  statement: string;
  followUpOption: ImpactOption | null;
  followUps: ImpactFollowUpView[];
}

export interface EvidencePlanItemView {
  id: string;
  order: number;
  sourceType: "ACTIVITY" | "OUTCOME" | "IMPACT";
  sourceId: string;
  sourceLabel: string;
  target: string | null;
  indicator: string | null;
  verification: string | null;
  collectionTiming: string | null;
  responsible: string | null;
  instrument: string | null;
  pending: string | null;
}

export interface JourneySnapshot {
  project: ProjectContextView;
  approvedStages: JourneyStageKey[];
  /** Primeira etapa ainda não aprovada; null quando a jornada está concluída. */
  currentStage: JourneyStageKey | null;
  activities: ActivityView[];
  outcomes: OutcomeView[];
  impact: ImpactView | null;
  evidencePlan: EvidencePlanItemView[];
}
