import "server-only";
import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { z } from "zod";
import { getJourneyAIProvider, JourneyAIConfigurationError, JourneyAIProviderError } from "@/lib/journey-ai/provider";
import { ACTION_INTENTS, journeyAIResponseSchema } from "@/lib/journey-ai/response-schema";
import { enforceActivityFlow, enforceActivityTiming, enforceCurrentStage } from "@/lib/journey-ai/proposal-guards";
import { JOURNEY_PROMPT_VERSION } from "@/lib/journey-ai/system-prompt";
import type { JourneyAIInput, JourneyAIProvider, JourneyAIResponse } from "@/lib/journey-ai/types";
import { isNavigateAction, navigatePath } from "@/lib/journey/actions";
import { parseProposalPayload, PROPOSAL_STAGE, PROPOSAL_TYPES, type ProposalTypeKey } from "@/lib/journey/proposal-schemas";
import { JOURNEY_STAGES } from "@/lib/journey/stages";
import type { JourneySnapshot } from "@/lib/journey/types";
import { getOrCreateConversation, parseState } from "@/server/journey/conversation";

const HISTORY_LIMIT = 20;

export interface TurnOutcome {
  ok: boolean;
  aiError?: string;
}

/** Entrada de um turno guardada para "Tentar novamente" (validada ao reler). */
const turnInputSchema: z.ZodType<JourneyAIInput> = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("START") }),
  z.object({ kind: z.literal("MESSAGE"), text: z.string().min(1).max(4000) }),
  z.object({
    kind: z.literal("ACTION"),
    actionId: z.string().min(1).max(100),
    intent: z.enum(ACTION_INTENTS),
    label: z.string().min(1).max(80),
  }),
  z.object({
    kind: z.literal("EVENT"),
    event: z.enum(["PROPOSAL_APPROVED", "PROPOSAL_REJECTED", "STAGE_APPROVED", "STAGE_REOPENED", "CONTENT_EDITED"]),
    proposalType: z.enum(PROPOSAL_TYPES).optional(),
    stage: z.enum(JOURNEY_STAGES).optional(),
    detail: z.string().max(2000).optional(),
  }),
]);

export function parseFailedInput(value: unknown): JourneyAIInput | null {
  const parsed = turnInputSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/**
 * Executa um turno do consultor virtual:
 * 1. monta a requisição a partir do snapshot (fonte de verdade);
 * 2. chama o provedor configurado (mock ou externo);
 * 3. valida a resposta por schema e a proposta pelo schema do seu tipo;
 * 4. grava a mensagem e, se houver, a nova proposta como PENDENTE.
 *
 * Nada aprovado é alterado aqui: propostas só viram dados após decisão
 * explícita da pessoa (ver proposals.ts).
 */
export async function runAssistantTurn(
  snapshot: JourneySnapshot,
  input: JourneyAIInput,
  provider: JourneyAIProvider = getJourneyAIProviderSafe(snapshot.project.id),
): Promise<TurnOutcome> {
  const projectId = snapshot.project.id;
  const conversation = await getOrCreateConversation(projectId);
  const [recent, pending] = await Promise.all([
    prisma.journeyMessage.findMany({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: "desc" },
      take: HISTORY_LIMIT,
      select: { role: true, content: true, stage: true },
    }),
    prisma.journeyProposal.findFirst({
      where: { conversationId: conversation.id, status: "PENDING" },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  let response: JourneyAIResponse;
  try {
    const raw = await provider.respond({
      snapshot,
      stage: snapshot.currentStage,
      state: parseState(conversation.state),
      pendingProposal: pending ? { id: pending.id, type: pending.type, payload: pending.payload } : null,
      history: recent.reverse().map((m) => ({
        role: m.role === "ASSISTANT" ? "assistant" : "user",
        content: m.content,
        stage: m.stage,
      })),
      input,
    });
    // Regras de condução do servidor: etapa atual, duração do projeto, ordem da Etapa 2.
    response = enforceActivityFlow(enforceActivityTiming(enforceCurrentStage(journeyAIResponseSchema.parse(raw), snapshot), snapshot), {
      snapshot,
      state: parseState(conversation.state),
      pendingProposalType: pending?.type ?? null,
      inputKind: input.kind,
    });
  } catch (error) {
    await rememberFailedInput(conversation.id, input);
    if (error instanceof JourneyAIConfigurationError) return { ok: false, aiError: error.message };
    if (error instanceof JourneyAIProviderError) {
      // Só o detalhe técnico vai ao log; ele nunca contém a chave.
      console.error(`[journey-ai] ${error.status}: ${error.detail}`);
      return { ok: false, aiError: error.userMessage };
    }
    console.error("[journey-ai] resposta inválida ou falha do provedor", error instanceof Error ? error.message : error);
    return {
      ok: false,
      aiError: "O consultor virtual não conseguiu responder agora. Seus dados aprovados não foram alterados.",
    };
  }

  // Valida a proposta pelo schema do tipo e garante que pertence à etapa atual.
  let proposal: { type: ProposalTypeKey; payload: unknown } | null = null;
  if (response.proposal) {
    try {
      const typed = parseProposalPayload(response.proposal.type, response.proposal.payload);
      if (PROPOSAL_STAGE[typed.type] !== snapshot.currentStage) throw new Error("Proposta fora da etapa atual.");
      proposal = { type: typed.type, payload: typed.payload };
    } catch (error) {
      console.error(
        "[journey-ai] proposta descartada por não respeitar o contrato",
        error instanceof Error ? error.message : error,
      );
      await rememberFailedInput(conversation.id, input);
      return {
        ok: false,
        aiError: "O consultor virtual sugeriu uma ficha em formato inválido. Nada foi gravado.",
      };
    }
  }

  // Ações de navegação só podem apontar para páginas internas.
  const actions = response.actions.filter((a) => !isNavigateAction(a.id) || navigatePath(a.id) !== null);
  const stage = snapshot.currentStage ?? "EVIDENCE_PLAN";

  await prisma.$transaction(async (tx) => {
    let proposalId: string | null = null;
    if (proposal) {
      // Uma nova proposta substitui as pendentes anteriores.
      await tx.journeyProposal.updateMany({
        where: { conversationId: conversation.id, status: "PENDING" },
        data: { status: "SUPERSEDED", decidedAt: new Date() },
      });
      const created = await tx.journeyProposal.create({
        data: {
          conversationId: conversation.id,
          projectId,
          stage,
          type: proposal.type,
          payload: proposal.payload as Prisma.InputJsonValue,
          isMock: provider.isMock,
        },
      });
      proposalId = created.id;
    } else if (response.requiresApproval && pending) {
      proposalId = pending.id;
    }

    await tx.journeyMessage.create({
      data: {
        conversationId: conversation.id,
        role: "ASSISTANT",
        content: response.message,
        stage,
        actions: actions as unknown as Prisma.InputJsonValue,
        proposalId,
        isMock: provider.isMock,
        promptVersion: provider.isMock ? null : JOURNEY_PROMPT_VERSION,
      },
    });

    await tx.journeyConversation.update({
      where: { id: conversation.id },
      data: {
        failedInput: Prisma.DbNull,
        ...(response.state !== undefined && {
          state: response.state === null ? Prisma.DbNull : (response.state as Prisma.InputJsonValue),
        }),
      },
    });
  });

  return { ok: true };
}

/** Guarda a entrada que falhou para que a pessoa possa tentar novamente. */
async function rememberFailedInput(conversationId: string, input: JourneyAIInput) {
  await prisma.journeyConversation.update({
    where: { id: conversationId },
    data: { failedInput: input as unknown as Prisma.InputJsonValue },
  });
}

/**
 * Lê o provedor sem derrubar a rota: erros de configuração viram mensagem.
 * No modo externo, cada chamada registra modelo, tokens e status do projeto.
 */
function getJourneyAIProviderSafe(projectId: string): JourneyAIProvider {
  try {
    return getJourneyAIProvider(process.env, {
      recordUsage: async (usage) => {
        await prisma.aiUsage.create({ data: { projectId, ...usage } });
      },
    });
  } catch (error) {
    if (error instanceof JourneyAIConfigurationError) {
      const message = error.message;
      return {
        name: "unconfigured",
        isMock: false,
        respond: async () => {
          throw new JourneyAIConfigurationError(message);
        },
      };
    }
    throw error;
  }
}
