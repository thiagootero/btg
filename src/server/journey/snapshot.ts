import "server-only";
import { prisma } from "@/lib/db";
import { areaLabel } from "@/lib/journey/areas";
import { JOURNEY_STAGES, currentStageFrom, type JourneyStageKey } from "@/lib/journey/stages";
import type { EvidencePlanItemView, JourneySnapshot } from "@/lib/journey/types";
import { stripTrailingPeriod, twoDigits } from "@/lib/journey/format";
import { NotFoundError } from "@/server/errors";

/** Carrega o projeto e todo o conteúdo aprovado. Chamar após checar o acesso. */
export async function loadSnapshot(projectId: string): Promise<JourneySnapshot> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      organization: { select: { name: true } },
      territories: { orderBy: { order: "asc" } },
      stageApprovals: true,
      activities: {
        orderBy: { order: "asc" },
        include: {
          target: true,
          indicators: { orderBy: { order: "asc" } },
          evidences: { orderBy: { order: "asc" } },
        },
      },
      outcomes: {
        orderBy: { order: "asc" },
        include: {
          activities: true,
          indicators: { orderBy: { order: "asc" } },
          evidences: { orderBy: { order: "asc" } },
        },
      },
      impact: { include: { followUps: { orderBy: { order: "asc" } } } },
      evidencePlanItems: { orderBy: { order: "asc" } },
    },
  });
  if (!project) throw new NotFoundError("Projeto não encontrado.");

  const approvedStages = JOURNEY_STAGES.filter((s) =>
    project.stageApprovals.some((a) => a.stage === s),
  ) as JourneyStageKey[];

  const activities = project.activities.map((a) => ({
    id: a.id,
    order: a.order,
    description: a.description,
    target: a.target
      ? {
          description: a.target.description,
          deadline: a.target.deadline,
          quantity: a.target.quantity === null ? null : Number(a.target.quantity),
          unit: a.target.unit,
          durationMonths: a.target.durationMonths,
        }
      : null,
    indicators: a.indicators.map((i) => ({ name: i.name, explanation: i.explanation })),
    evidences: a.evidences.map((e) => e.description),
  }));

  const outcomes = project.outcomes.map((o) => ({
    id: o.id,
    order: o.order,
    description: o.description,
    target: o.target,
    relatedActivityIds: o.activities.map((x) => x.activityId),
    indicators: o.indicators.map((i) => ({ name: i.name, explanation: i.explanation })),
    evidences: o.evidences.map((e) => e.description),
  }));

  const impact = project.impact
    ? {
        id: project.impact.id,
        statement: project.impact.statement,
        followUpOption: project.impact.followUpOption,
        followUps: project.impact.followUps.map((f) => ({
          id: f.id,
          description: f.description,
          target: f.target,
          indicator: f.indicator,
          verification: f.verification,
          periodAfterEnd: f.periodAfterEnd,
          notes: f.notes,
        })),
      }
    : null;

  const evidencePlan: EvidencePlanItemView[] = project.evidencePlanItems.map((item) => {
    let sourceId = "";
    let sourceLabel = "";
    if (item.sourceType === "ACTIVITY") {
      const i = activities.findIndex((a) => a.id === item.activityId);
      sourceId = item.activityId ?? "";
      sourceLabel = i >= 0 ? `Atividade ${twoDigits(i + 1)} — ${stripTrailingPeriod(activities[i].description)}` : "Atividade";
    } else if (item.sourceType === "OUTCOME") {
      const i = outcomes.findIndex((o) => o.id === item.outcomeId);
      sourceId = item.outcomeId ?? "";
      sourceLabel = i >= 0 ? `Resultado ${twoDigits(i + 1)} — ${stripTrailingPeriod(outcomes[i].description)}` : "Resultado";
    } else {
      const f = impact?.followUps.find((x) => x.id === item.impactFollowUpId);
      sourceId = item.impactFollowUpId ?? "";
      sourceLabel = f ? `Impacto — ${stripTrailingPeriod(f.description)}` : "Impacto de longo prazo";
    }
    return {
      id: item.id,
      order: item.order,
      sourceType: item.sourceType,
      sourceId,
      sourceLabel,
      target: item.target,
      indicator: item.indicator,
      verification: item.verification,
      collectionTiming: item.collectionTiming,
      responsible: item.responsible,
      instrument: item.instrument,
      pending: item.pending,
    };
  });

  return {
    project: {
      id: project.id,
      organizationId: project.organizationId,
      organizationName: project.organization.name,
      name: project.name,
      area: project.area,
      areaOther: project.areaOther,
      areaLabel: areaLabel(project.area, project.areaOther),
      targetAudience: project.targetAudience,
      durationMonths: project.durationMonths,
      startDate: project.startDate ? project.startDate.toISOString().slice(0, 10) : null,
      problem: project.problem,
      strategy: project.strategy,
      territories: project.territories.map((t) => ({ city: t.city, state: t.state })),
      isDemo: project.isDemo,
      updatedAt: project.updatedAt.toISOString(),
    },
    approvedStages,
    currentStage: currentStageFrom(approvedStages),
    activities,
    outcomes,
    impact,
    evidencePlan,
  };
}
