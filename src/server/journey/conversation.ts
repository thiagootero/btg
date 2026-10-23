import "server-only";
import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { journeyAIActionSchema, journeyConversationStateSchema } from "@/lib/journey-ai/response-schema";
import type { JourneyAIAction, JourneyConversationState } from "@/lib/journey-ai/response-schema";
import { aiProviderMode } from "@/lib/journey-ai/provider";
import { checkProposal } from "@/lib/journey/proposal-rules";
import { parseProposalPayload, type ProposalTypeKey } from "@/lib/journey/proposal-schemas";
import type { JourneySnapshot } from "@/lib/journey/types";
import type { JourneyViewState, MessageView, ProposalView } from "@/lib/journey/view-types";
import { loadSnapshot } from "@/server/journey/snapshot";
import { z } from "zod";

export async function getOrCreateConversation(projectId: string) {
  const existing = await prisma.journeyConversation.findUnique({ where: { projectId } });
  if (existing) return existing;
  try {
    return await prisma.journeyConversation.create({ data: { projectId } });
  } catch (error) {
    // Duas requisições simultâneas no primeiro acesso: a outra já criou a conversa.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return prisma.journeyConversation.findUniqueOrThrow({ where: { projectId } });
    }
    throw error;
  }
}

export function parseState(value: unknown): JourneyConversationState | null {
  const parsed = journeyConversationStateSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function parseActions(value: unknown): JourneyAIAction[] {
  const parsed = z.array(journeyAIActionSchema).safeParse(value);
  return parsed.success ? parsed.data : [];
}

type ProposalRow = {
  id: string;
  type: ProposalTypeKey;
  stage: ProposalView["stage"];
  payload: unknown;
  status: ProposalView["status"];
  isMock: boolean;
  createdAt: Date;
};

export function toProposalView(row: ProposalRow, snapshot: JourneySnapshot): ProposalView {
  let warnings: ProposalView["warnings"] = [];
  if (row.status === "PENDING") {
    try {
      warnings = checkProposal(parseProposalPayload(row.type, row.payload), snapshot);
    } catch {
      warnings = [{ field: "payload", message: "Esta proposta tem um formato inválido e precisa ser editada." }];
    }
  }
  return {
    id: row.id,
    type: row.type,
    stage: row.stage,
    payload: row.payload,
    status: row.status,
    isMock: row.isMock,
    warnings,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Monta o estado completo da tela da jornada. */
export async function buildViewState(
  projectId: string,
  canEdit: boolean,
  snapshot?: JourneySnapshot,
  aiError?: string,
): Promise<JourneyViewState> {
  const snap = snapshot ?? (await loadSnapshot(projectId));
  const conversation = await getOrCreateConversation(projectId);
  const [messages, proposals] = await Promise.all([
    prisma.journeyMessage.findMany({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: "asc" },
      take: 400,
    }),
    prisma.journeyProposal.findMany({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const proposalViews = Object.fromEntries(proposals.map((p) => [p.id, toProposalView(p, snap)]));
  const pending = proposals.filter((p) => p.status === "PENDING").at(-1);

  let aiMode: JourneyViewState["aiMode"] = "mock";
  try {
    aiMode = aiProviderMode();
  } catch {
    aiMode = "external";
  }

  return {
    snapshot: snap,
    messages: messages.map(
      (m): MessageView => ({
        id: m.id,
        role: m.role,
        content: m.content,
        stage: m.stage,
        actions: parseActions(m.actions),
        proposalId: m.proposalId,
        isMock: m.isMock,
        createdAt: m.createdAt.toISOString(),
      }),
    ),
    pendingProposal: pending ? proposalViews[pending.id] : null,
    proposals: proposalViews,
    conversationState: parseState(conversation.state),
    canEdit,
    aiMode,
    aiError,
    canRetry: canEdit && conversation.failedInput !== null,
  };
}
