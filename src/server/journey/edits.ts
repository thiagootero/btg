import "server-only";
import { z } from "zod";
import { prisma } from "@/lib/db";
import type { AccessUser } from "@/lib/auth/permissions";
import {
  activityEditSchema,
  evidencePlanItemEditSchema,
  impactEditSchema,
  outcomeEditSchema,
} from "@/lib/journey/api-schemas";
import {
  checkActivity,
  checkFollowUps,
  checkImpactStatement,
  checkOutcomeStatement,
  checkOutcomeVerification,
  type RuleIssue,
} from "@/lib/journey/proposal-rules";
import type { JourneyViewState } from "@/lib/journey/view-types";
import { consolidateEvidencePlan } from "@/lib/journey/progress";
import { NotFoundError, ValidationError } from "@/server/errors";
import { assertProjectAccess } from "@/server/projects";
import { activityChildren, followUpRows, resyncEvidencePlan } from "@/server/journey/apply";
import { buildViewState } from "@/server/journey/conversation";
import { loadSnapshot } from "@/server/journey/snapshot";

/**
 * Edição de conteúdo JÁ APROVADO. Toda edição exige `confirmReplace: true`
 * (validado por schema), passa pelas mesmas regras metodológicas das
 * propostas e mantém o plano de evidências sincronizado.
 */

function throwIssues(issues: RuleIssue[]) {
  if (!issues.length) return;
  const fieldErrors: Record<string, string[]> = {};
  for (const i of issues) (fieldErrors[i.field] ??= []).push(i.message);
  throw new ValidationError(issues.map((i) => i.message).join(" "), fieldErrors);
}

async function afterEdit(projectId: string): Promise<JourneyViewState> {
  const snapshot = await loadSnapshot(projectId);
  await prisma.$transaction(async (tx) => resyncEvidencePlan(tx, snapshot));
  return buildViewState(projectId, true, await loadSnapshot(projectId));
}

export async function updateActivity(user: AccessUser, projectId: string, activityId: string, body: unknown) {
  await assertProjectAccess(user, projectId, "edit");
  const input = activityEditSchema.parse(body);
  const { project } = await loadSnapshot(projectId);
  throwIssues(checkActivity(input, project));
  const exists = await prisma.activity.findFirst({ where: { id: activityId, projectId }, select: { id: true } });
  if (!exists) throw new NotFoundError("Atividade não encontrada.");

  await prisma.$transaction(async (tx) => {
    await tx.activityTarget.deleteMany({ where: { activityId } });
    await tx.activityIndicator.deleteMany({ where: { activityId } });
    await tx.activityEvidence.deleteMany({ where: { activityId } });
    await tx.activity.update({
      where: { id: activityId },
      data: {
        description: input.description,
        approvedAt: new Date(),
        approvedById: user.id,
        ...activityChildren(input),
      },
    });
  });
  return afterEdit(projectId);
}

export async function deleteActivity(user: AccessUser, projectId: string, activityId: string) {
  await assertProjectAccess(user, projectId, "edit");
  const deleted = await prisma.activity.deleteMany({ where: { id: activityId, projectId } });
  if (deleted.count === 0) throw new NotFoundError("Atividade não encontrada.");
  return afterEdit(projectId);
}

export async function updateOutcome(user: AccessUser, projectId: string, outcomeId: string, body: unknown) {
  await assertProjectAccess(user, projectId, "edit");
  const input = outcomeEditSchema.parse(body);
  const snapshot = await loadSnapshot(projectId);
  if (!snapshot.outcomes.some((o) => o.id === outcomeId)) throw new NotFoundError("Resultado não encontrado.");
  throwIssues([
    ...checkOutcomeStatement(input.statement, input.relatedActivityIds, snapshot, "statement"),
    ...(input.verification ? checkOutcomeVerification(input.verification, "verification") : []),
  ]);
  if ((input.indicators.length > 0) !== Boolean(input.verification)) {
    throw new ValidationError("Informe indicador e verificação juntos (ou deixe ambos em branco para definir depois).");
  }
  await prisma.$transaction(async (tx) => {
    await tx.outcomeActivity.deleteMany({ where: { outcomeId } });
    await tx.outcomeIndicator.deleteMany({ where: { outcomeId } });
    await tx.outcomeEvidence.deleteMany({ where: { outcomeId } });
    await tx.expectedOutcome.update({
      where: { id: outcomeId },
      data: {
        description: input.statement,
        target: input.target,
        approvedAt: new Date(),
        approvedById: user.id,
        activities: { create: input.relatedActivityIds.map((activityId) => ({ activityId })) },
        indicators: {
          create: input.indicators.map((i, order) => ({ name: i.name, explanation: i.explanation, order })),
        },
        evidences: { create: input.verification ? [{ description: input.verification, order: 0 }] : [] },
      },
    });
  });
  return afterEdit(projectId);
}

export async function deleteOutcome(user: AccessUser, projectId: string, outcomeId: string) {
  await assertProjectAccess(user, projectId, "edit");
  const deleted = await prisma.expectedOutcome.deleteMany({ where: { id: outcomeId, projectId } });
  if (deleted.count === 0) throw new NotFoundError("Resultado não encontrado.");
  return afterEdit(projectId);
}

export async function updateImpact(user: AccessUser, projectId: string, body: unknown) {
  await assertProjectAccess(user, projectId, "edit");
  const input = impactEditSchema.parse(body);
  const impact = await prisma.longTermImpact.findUnique({ where: { projectId }, select: { id: true } });
  if (!impact) throw new NotFoundError("Impacto de longo prazo ainda não registrado.");
  throwIssues([...checkImpactStatement(input.statement), ...checkFollowUps(input.followUps)]);
  if (input.followUpOption && input.followUpOption !== "VISION_ONLY" && input.followUps.length === 0) {
    throw new ValidationError("Inclua pelo menos uma mudança ou avaliação a acompanhar.");
  }
  await prisma.$transaction(async (tx) => {
    await tx.impactFollowUp.deleteMany({ where: { impactId: impact.id } });
    await tx.longTermImpact.update({
      where: { id: impact.id },
      data: {
        statement: input.statement,
        followUpOption: input.followUpOption,
        approvedAt: new Date(),
        approvedById: user.id,
        followUps: {
          create: input.followUpOption && input.followUpOption !== "VISION_ONLY" ? followUpRows(input.followUps) : [],
        },
      },
    });
  });
  return afterEdit(projectId);
}

export async function updateEvidencePlanItem(user: AccessUser, projectId: string, itemId: string, body: unknown) {
  await assertProjectAccess(user, projectId, "edit");
  const input = evidencePlanItemEditSchema.parse(body);
  const updated = await prisma.evidencePlanItem.updateMany({ where: { id: itemId, projectId }, data: input });
  if (updated.count === 0) throw new NotFoundError("Linha do plano não encontrada.");
  return buildViewState(projectId, true);
}

export const idSchema = z.string().min(1).max(64);

/**
 * Reconsolida o plano a partir do conteúdo aprovado: acrescenta linhas para
 * itens novos, remove as de itens excluídos e preserva os campos operacionais
 * já preenchidos.
 */
export async function reconsolidateEvidencePlan(user: AccessUser, projectId: string) {
  await assertProjectAccess(user, projectId, "edit");
  const snapshot = await loadSnapshot(projectId);
  if (!snapshot.approvedStages.includes("IMPACT")) {
    throw new ValidationError("O plano de evidências é consolidado após a aprovação do impacto de longo prazo.");
  }
  const consolidated = consolidateEvidencePlan(snapshot);
  const existing = new Map(snapshot.evidencePlan.map((i) => [`${i.sourceType}:${i.sourceId}`, i]));
  await prisma.$transaction(async (tx) => {
    await tx.evidencePlanItem.deleteMany({ where: { projectId } });
    for (const item of consolidated) {
      const kept = existing.get(`${item.sourceType}:${item.sourceId}`);
      await tx.evidencePlanItem.create({
        data: {
          projectId,
          sourceType: item.sourceType,
          activityId: item.sourceType === "ACTIVITY" ? item.sourceId : null,
          outcomeId: item.sourceType === "OUTCOME" ? item.sourceId : null,
          impactId: item.sourceType === "IMPACT" ? snapshot.impact?.id ?? null : null,
          impactFollowUpId: item.sourceType === "IMPACT" ? item.sourceId : null,
          target: item.target,
          indicator: item.indicator,
          verification: item.verification,
          collectionTiming: kept ? kept.collectionTiming : item.collectionTiming,
          responsible: kept ? kept.responsible : item.responsible,
          instrument: kept ? kept.instrument : item.instrument,
          pending: kept ? kept.pending : item.pending,
          order: item.order,
        },
      });
    }
  });
  return buildViewState(projectId, true);
}
