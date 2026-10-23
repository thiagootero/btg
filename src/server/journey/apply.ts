import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { consolidateEvidencePlan } from "@/lib/journey/progress";
import {
  isActivityList,
  type ActivityListPayload,
  type ActivityPayload,
  type EvidencePlanPayload,
  type ImpactFollowUpInput,
  type ImpactPayload,
  type OutcomePayload,
  type TypedProposal,
} from "@/lib/journey/proposal-schemas";
import type { JourneySnapshot } from "@/lib/journey/types";
import { ValidationError } from "@/server/errors";

type Tx = Prisma.TransactionClient;

interface ApplyContext {
  tx: Tx;
  snapshot: JourneySnapshot;
  userId: string;
}

/** Grava no banco uma proposta EXPLICITAMENTE aprovada e já validada. */
export async function applyProposal(ctx: ApplyContext, proposal: TypedProposal): Promise<void> {
  switch (proposal.type) {
    case "ACTIVITY":
      if (isActivityList(proposal.payload)) return createActivityList(ctx, proposal.payload);
      return proposal.payload.activityId ? detailActivity(ctx, proposal.payload.activityId, proposal.payload) : createActivity(ctx, proposal.payload);
    case "OUTCOME":
      return applyOutcome(ctx, proposal.payload);
    case "IMPACT":
      return applyImpact(ctx, proposal.payload);
    case "EVIDENCE_PLAN":
      return applyEvidencePlan(ctx, proposal.payload);
  }
}

// ---------------------------------------------------------------------------

export function activityChildren(payload: ActivityPayload) {
  return {
    target: {
      create: {
        description: payload.target.description,
        deadline: payload.target.deadline,
        quantity: payload.target.quantity,
        unit: payload.target.unit,
        durationMonths: payload.target.durationMonths,
      },
    },
    indicators: {
      create: payload.indicators.map((i, order) => ({ name: i.name, explanation: i.explanation, order })),
    },
    evidences: { create: payload.evidences.map((e, order) => ({ description: e.description, order })) },
  };
}

/** Mapeamento aprovado: cria as atividades da lista, ainda sem meta/indicadores. */
async function createActivityList({ tx, snapshot, userId }: ApplyContext, payload: ActivityListPayload) {
  let order = Math.max(-1, ...snapshot.activities.map((a) => a.order)) + 1;
  for (const item of payload.activities) {
    await tx.activity.create({
      data: {
        projectId: snapshot.project.id,
        description: item.description,
        order: order++,
        approvalStatus: "APPROVED",
        approvedAt: new Date(),
        approvedById: userId,
      },
    });
  }
}

/** Ficha aprovada de uma atividade da lista: grava meta, indicadores e verificação. */
async function detailActivity({ tx, snapshot, userId }: ApplyContext, activityId: string, payload: ActivityPayload) {
  if (!snapshot.activities.some((a) => a.id === activityId)) throw new ValidationError("Atividade não encontrada neste projeto.");
  await tx.activityTarget.deleteMany({ where: { activityId } });
  await tx.activityIndicator.deleteMany({ where: { activityId } });
  await tx.activityEvidence.deleteMany({ where: { activityId } });
  await tx.activity.update({
    where: { id: activityId },
    data: { description: payload.description, approvedAt: new Date(), approvedById: userId, ...activityChildren(payload) },
  });
}

async function createActivity({ tx, snapshot, userId }: ApplyContext, payload: ActivityPayload) {
  const order = Math.max(-1, ...snapshot.activities.map((a) => a.order)) + 1;
  await tx.activity.create({
    data: {
      projectId: snapshot.project.id,
      description: payload.description,
      order,
      approvalStatus: "APPROVED",
      approvedAt: new Date(),
      approvedById: userId,
      ...activityChildren(payload),
    },
  });
}

async function applyOutcome({ tx, snapshot, userId }: ApplyContext, payload: OutcomePayload) {
  if (payload.step === "STATEMENTS") {
    let order = Math.max(-1, ...snapshot.outcomes.map((o) => o.order)) + 1;
    for (const outcome of payload.outcomes) {
      await tx.expectedOutcome.create({
        data: {
          projectId: snapshot.project.id,
          description: outcome.statement,
          order: order++,
          approvalStatus: "APPROVED",
          approvedAt: new Date(),
          approvedById: userId,
          activities: { create: outcome.relatedActivityIds.map((activityId) => ({ activityId })) },
        },
      });
    }
    return;
  }
  if (payload.step === "TARGET") {
    await tx.expectedOutcome.update({
      where: { id: payload.outcomeId, projectId: snapshot.project.id },
      data: { target: payload.target },
    });
    return;
  }
  // DETAIL grava a meta junto com indicador e verificação; INDICATOR só os dois últimos.
  await tx.outcomeIndicator.deleteMany({ where: { outcomeId: payload.outcomeId } });
  await tx.outcomeEvidence.deleteMany({ where: { outcomeId: payload.outcomeId } });
  await tx.expectedOutcome.update({
    where: { id: payload.outcomeId, projectId: snapshot.project.id },
    data: {
      ...(payload.step === "DETAIL" && { target: payload.target }),
      indicators: {
        create: payload.indicators.map((i, order) => ({ name: i.name, explanation: i.explanation, order })),
      },
      evidences: { create: [{ description: payload.verification, order: 0 }] },
    },
  });
}

export function followUpRows(followUps: ImpactFollowUpInput[]) {
  return followUps.map((f, order) => ({
    description: f.description,
    target: f.target,
    indicator: f.indicator,
    verification: f.verification,
    periodAfterEnd: f.periodAfterEnd,
    notes: f.notes,
    order,
  }));
}

async function applyImpact({ tx, snapshot, userId }: ApplyContext, payload: ImpactPayload) {
  const projectId = snapshot.project.id;
  if (payload.step === "STATEMENT") {
    await tx.longTermImpact.upsert({
      where: { projectId },
      create: {
        projectId,
        statement: payload.statement,
        approvalStatus: "APPROVED",
        approvedAt: new Date(),
        approvedById: userId,
      },
      update: { statement: payload.statement, approvedAt: new Date(), approvedById: userId },
    });
    return;
  }
  if (!snapshot.impact) throw new ValidationError("Aprove a formulação do impacto antes de escolher o acompanhamento.");
  await tx.impactFollowUp.deleteMany({ where: { impactId: snapshot.impact.id } });
  await tx.longTermImpact.update({
    where: { id: snapshot.impact.id },
    data: {
      followUpOption: payload.option,
      followUps: { create: payload.option === "VISION_ONLY" ? [] : followUpRows(payload.followUps) },
    },
  });
}

/**
 * O plano consolida o que foi aprovado: meta, indicador e verificação são
 * recalculados a partir do banco (nunca vêm da proposta). Da proposta são
 * aproveitados apenas os campos operacionais revisados pela pessoa.
 */
async function applyEvidencePlan({ tx, snapshot }: ApplyContext, payload: EvidencePlanPayload) {
  const operational = new Map(payload.items.map((i) => [`${i.sourceType}:${i.sourceId}`, i]));
  const consolidated = consolidateEvidencePlan(snapshot);
  await tx.evidencePlanItem.deleteMany({ where: { projectId: snapshot.project.id } });
  for (const item of consolidated) {
    const edited = operational.get(`${item.sourceType}:${item.sourceId}`);
    if (!edited) continue; // linha removida pela pessoa na revisão
    await tx.evidencePlanItem.create({
      data: {
        projectId: snapshot.project.id,
        sourceType: item.sourceType,
        activityId: item.sourceType === "ACTIVITY" ? item.sourceId : null,
        outcomeId: item.sourceType === "OUTCOME" ? item.sourceId : null,
        impactId: item.sourceType === "IMPACT" ? snapshot.impact?.id ?? null : null,
        impactFollowUpId: item.sourceType === "IMPACT" ? item.sourceId : null,
        target: item.target,
        indicator: item.indicator,
        verification: item.verification,
        collectionTiming: edited.collectionTiming,
        responsible: edited.responsible,
        instrument: edited.instrument,
        pending: edited.pending,
        order: item.order,
      },
    });
  }
}

/**
 * Após editar conteúdo aprovado, atualiza meta/indicador/verificação das
 * linhas do plano que apontam para ele, preservando os campos operacionais.
 */
export async function resyncEvidencePlan(tx: Tx, snapshot: JourneySnapshot): Promise<void> {
  const consolidated = consolidateEvidencePlan(snapshot);
  const existing = await tx.evidencePlanItem.findMany({ where: { projectId: snapshot.project.id } });
  for (const row of existing) {
    const sourceId = row.activityId ?? row.outcomeId ?? row.impactFollowUpId;
    const match = consolidated.find((c) => c.sourceType === row.sourceType && c.sourceId === sourceId);
    if (!match) continue;
    await tx.evidencePlanItem.update({
      where: { id: row.id },
      data: { target: match.target, indicator: match.indicator, verification: match.verification },
    });
  }
}
