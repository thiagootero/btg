import "server-only";
import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import type { AccessUser } from "@/lib/auth/permissions";
import { ACTION_IDS, isNavigateAction, isProposalAction } from "@/lib/journey/actions";
import type { JourneyInput, ProposalDecision } from "@/lib/journey/api-schemas";
import { stageApprovalBlockers } from "@/lib/journey/progress";
import { checkProposal } from "@/lib/journey/proposal-rules";
import { parseProposalPayload, PROPOSAL_STAGE } from "@/lib/journey/proposal-schemas";
import { detectSensitiveData, SENSITIVE_DATA_MESSAGE } from "@/lib/journey/rules";
import { JOURNEY_STAGES, laterStages, STAGE_LABELS, type JourneyStageKey } from "@/lib/journey/stages";
import type { JourneySnapshot } from "@/lib/journey/types";
import type { JourneyViewState } from "@/lib/journey/view-types";
import { ConflictError, NotFoundError, ValidationError } from "@/server/errors";
import { assertProjectAccess } from "@/server/projects";
import { applyProposal } from "@/server/journey/apply";
import { buildViewState, getOrCreateConversation, parseActions } from "@/server/journey/conversation";
import { loadSnapshot } from "@/server/journey/snapshot";
import { parseFailedInput, runAssistantTurn } from "@/server/journey/turn";

export async function getJourneyView(user: AccessUser, projectId: string): Promise<JourneyViewState> {
  const { access } = await assertProjectAccess(user, projectId, "view");
  return buildViewState(projectId, access === "edit");
}

function zodLikeIssues(issues: { field: string; message: string }[]): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const i of issues) (out[i.field] ??= []).push(i.message);
  return out;
}

async function refreshProjectStatus(projectId: string) {
  const approvals = await prisma.journeyStageApproval.findMany({ where: { projectId }, select: { stage: true } });
  const approved = new Set(approvals.map((a) => a.stage));
  const current = JOURNEY_STAGES.find((s) => !approved.has(s));
  await prisma.project.update({
    where: { id: projectId },
    data: {
      currentStage: current ?? "EVIDENCE_PLAN",
      journeyStatus: current ? "IN_PROGRESS" : "COMPLETED",
    },
  });
}

/** Mensagem, ação ou início da conversa. */
export async function postJourneyInput(
  user: AccessUser,
  projectId: string,
  input: JourneyInput,
): Promise<JourneyViewState> {
  await assertProjectAccess(user, projectId, "edit");
  const conversation = await getOrCreateConversation(projectId);
  let snapshot = await loadSnapshot(projectId);
  const stage = snapshot.currentStage ?? "EVIDENCE_PLAN";

  if (input.type === "start") {
    const hasMessages = await prisma.journeyMessage.count({ where: { conversationId: conversation.id } });
    if (hasMessages > 0) return buildViewState(projectId, true, snapshot);
    await prisma.project.updateMany({
      where: { id: projectId, journeyStatus: "NOT_STARTED" },
      data: { journeyStatus: "IN_PROGRESS" },
    });
    const turn = await runAssistantTurn(snapshot, { kind: "START" });
    return buildViewState(projectId, true, snapshot, turn.aiError);
  }

  if (input.type === "retry") {
    const failed = parseFailedInput(conversation.failedInput);
    if (!failed) throw new ValidationError("Não há resposta pendente do consultor para tentar novamente.");
    const turn = await runAssistantTurn(snapshot, failed);
    return buildViewState(projectId, true, snapshot, turn.aiError);
  }

  if (input.type === "message") {
    if (detectSensitiveData(input.text).length > 0) {
      throw new ValidationError(SENSITIVE_DATA_MESSAGE, { text: [SENSITIVE_DATA_MESSAGE] });
    }
    await prisma.journeyMessage.create({
      data: { conversationId: conversation.id, role: "USER", content: input.text, stage, authorId: user.id },
    });
    const turn = await runAssistantTurn(snapshot, { kind: "MESSAGE", text: input.text });
    return buildViewState(projectId, true, snapshot, turn.aiError);
  }

  // Ação: precisa ter sido oferecida na última mensagem do consultor.
  const lastAssistant = await prisma.journeyMessage.findFirst({
    where: { conversationId: conversation.id, role: "ASSISTANT" },
    orderBy: { createdAt: "desc" },
  });
  const action = parseActions(lastAssistant?.actions).find((a) => a.id === input.actionId);
  if (!action || isNavigateAction(action.id) || isProposalAction(action.id)) {
    throw new ValidationError("Essa opção não está mais disponível. Continue pela conversa.");
  }
  await prisma.journeyMessage.create({
    data: { conversationId: conversation.id, role: "USER", content: action.label, stage, authorId: user.id },
  });

  if (action.id === ACTION_IDS.APPROVE_STAGE) {
    if (!snapshot.currentStage) throw new ConflictError("Todas as etapas já foram aprovadas.");
    const approvedStage = snapshot.currentStage;
    await approveStage(snapshot, approvedStage, user.id);
    snapshot = await loadSnapshot(projectId);
    const turn = await runAssistantTurn(snapshot, { kind: "EVENT", event: "STAGE_APPROVED", stage: approvedStage });
    return buildViewState(projectId, true, snapshot, turn.aiError);
  }

  const turn = await runAssistantTurn(snapshot, {
    kind: "ACTION",
    actionId: action.id,
    intent: action.intent,
    label: action.label,
  });
  return buildViewState(projectId, true, snapshot, turn.aiError);
}

/** Aprova uma etapa após validar no servidor que está completa. */
async function approveStage(snapshot: JourneySnapshot, stage: JourneyStageKey, userId: string) {
  if (snapshot.approvedStages.includes(stage)) throw new ConflictError("Esta etapa já está aprovada.");
  const blockers = stageApprovalBlockers(snapshot, stage);
  if (blockers.length) throw new ValidationError(blockers.join(" "), { stage: blockers });
  const pending = await prisma.journeyProposal.count({
    where: { projectId: snapshot.project.id, status: "PENDING" },
  });
  if (pending > 0) throw new ValidationError("Há uma proposta aguardando decisão. Aprove ou exclua antes de concluir a etapa.");
  await prisma.journeyStageApproval.create({ data: { projectId: snapshot.project.id, stage, approvedById: userId } });
  await prisma.journeyConversation.update({
    where: { projectId: snapshot.project.id },
    data: { state: Prisma.DbNull },
  });
  await refreshProjectStatus(snapshot.project.id);
}

export async function changeStage(
  user: AccessUser,
  projectId: string,
  body: { stage: JourneyStageKey; action: "approve" | "reopen"; confirm?: boolean },
): Promise<JourneyViewState> {
  await assertProjectAccess(user, projectId, "edit");
  const snapshot = await loadSnapshot(projectId);

  if (body.action === "approve") {
    if (snapshot.currentStage !== body.stage) {
      throw new ValidationError(`A etapa atual é “${STAGE_LABELS[snapshot.currentStage ?? "EVIDENCE_PLAN"]}”.`);
    }
    await approveStage(snapshot, body.stage, user.id);
    const next = await loadSnapshot(projectId);
    const turn = await runAssistantTurn(next, { kind: "EVENT", event: "STAGE_APPROVED", stage: body.stage });
    return buildViewState(projectId, true, next, turn.aiError);
  }

  // Reabrir: conteúdo aprovado é mantido, mas a etapa e as seguintes voltam
  // a exigir aprovação. Exige confirmação explícita.
  if (!snapshot.approvedStages.includes(body.stage)) throw new ValidationError("Esta etapa ainda não foi aprovada.");
  if (!body.confirm) {
    throw new ConflictError("Reabrir esta etapa exigirá nova aprovação dela e das etapas seguintes. Confirme para continuar.");
  }
  const stages = [body.stage, ...laterStages(body.stage)];
  await prisma.$transaction([
    prisma.journeyStageApproval.deleteMany({ where: { projectId, stage: { in: stages } } }),
    prisma.journeyProposal.updateMany({
      where: { projectId, status: "PENDING" },
      data: { status: "SUPERSEDED", decidedAt: new Date() },
    }),
    prisma.journeyConversation.update({ where: { projectId }, data: { state: Prisma.DbNull } }),
  ]);
  await refreshProjectStatus(projectId);
  const next = await loadSnapshot(projectId);
  const turn = await runAssistantTurn(next, { kind: "EVENT", event: "STAGE_REOPENED", stage: body.stage });
  return buildViewState(projectId, true, next, turn.aiError);
}

/**
 * Decisão sobre uma proposta. Somente a proposta explicitamente aprovada (na
 * versão original ou editada) é validada e aplicada ao banco.
 */
export async function decideProposal(
  user: AccessUser,
  projectId: string,
  proposalId: string,
  decision: ProposalDecision,
): Promise<JourneyViewState> {
  await assertProjectAccess(user, projectId, "edit");
  const proposal = await prisma.journeyProposal.findFirst({ where: { id: proposalId, projectId } });
  if (!proposal) throw new NotFoundError("Proposta não encontrada.");
  if (proposal.status !== "PENDING") throw new ConflictError("Esta proposta já foi decidida ou substituída.");

  let snapshot = await loadSnapshot(projectId);

  if (decision.decision === "REJECT") {
    await prisma.$transaction([
      prisma.journeyProposal.update({
        where: { id: proposal.id },
        data: { status: "REJECTED", decidedAt: new Date(), decidedById: user.id },
      }),
      prisma.journeyConversation.update({ where: { projectId }, data: { state: Prisma.DbNull } }),
    ]);
    const turn = await runAssistantTurn(snapshot, {
      kind: "EVENT",
      event: "PROPOSAL_REJECTED",
      proposalType: proposal.type,
    });
    return buildViewState(projectId, true, snapshot, turn.aiError);
  }

  const stage = PROPOSAL_STAGE[proposal.type];
  if (snapshot.approvedStages.includes(stage)) {
    throw new ConflictError("Esta etapa já foi aprovada. Reabra a etapa para registrar novas alterações.");
  }
  if (snapshot.currentStage !== stage) {
    throw new ValidationError("Conclua as etapas anteriores antes de aprovar esta proposta.");
  }

  const typed = parseProposalPayload(proposal.type, decision.payload ?? proposal.payload);
  const issues = checkProposal(typed, snapshot);
  if (issues.length) {
    throw new ValidationError(issues.map((i) => i.message).join(" "), zodLikeIssues(issues));
  }

  await prisma.$transaction(async (tx) => {
    // Garante que a proposta continua pendente (evita aprovação dupla).
    const updated = await tx.journeyProposal.updateMany({
      where: { id: proposal.id, status: "PENDING" },
      data: {
        status: "APPROVED",
        decidedAt: new Date(),
        decidedById: user.id,
        payload: typed.payload as Prisma.InputJsonValue,
      },
    });
    if (updated.count !== 1) throw new ConflictError("Esta proposta já foi decidida.");
    await applyProposal({ tx, snapshot, userId: user.id }, typed);
    await tx.journeyConversation.update({ where: { projectId }, data: { state: Prisma.DbNull } });
    await tx.project.update({ where: { id: projectId }, data: { updatedAt: new Date() } });
  });

  snapshot = await loadSnapshot(projectId);
  const turn = await runAssistantTurn(snapshot, {
    kind: "EVENT",
    event: "PROPOSAL_APPROVED",
    proposalType: proposal.type,
  });
  return buildViewState(projectId, true, snapshot, turn.aiError);
}
