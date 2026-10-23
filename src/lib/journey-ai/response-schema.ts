import { z } from "zod";
import { JOURNEY_STAGES } from "@/lib/journey/stages";
import { PROPOSAL_TYPES } from "@/lib/journey/proposal-schemas";

/**
 * Contrato JSON que QUALQUER provedor de IA deve respeitar. A resposta é
 * validada no servidor antes de qualquer gravação. O conteúdo de `proposal`
 * é validado em seguida pelo schema específico do tipo (proposal-schemas.ts)
 * e pelas regras metodológicas (rules.ts).
 */

export const ACTION_INTENTS = ["APPROVE", "EDIT", "DELETE", "ADD", "CONTINUE", "SHOW_EXAMPLES"] as const;

export const journeyAIActionSchema = z.object({
  id: z.string().trim().min(1).max(100),
  label: z.string().trim().min(1).max(80),
  intent: z.enum(ACTION_INTENTS),
});

/**
 * Estado transitório da conversa. Guarda apenas o rascunho em construção;
 * o conteúdo aprovado sempre vem das tabelas estruturadas.
 */
export const journeyConversationStateSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("ACTIVITY_DRAFT"),
    step: z.enum(["CONFIRM_DESCRIPTION", "ASK_TARGET"]),
    description: z.string().max(1000),
    /** Meta já informada pela pessoa, guardada enquanto se pergunta se há algo a acrescentar. */
    target: z.string().max(1500).nullish(),
    /** Atividade da lista aprovada que está sendo detalhada (Etapa 2.2). */
    activityId: z.string().max(100).nullish(),
  }),
  z.object({ kind: z.literal("ACTIVITIES_REVIEW") }),
  z.object({ kind: z.literal("OUTCOMES_REVIEW") }),
  z.object({ kind: z.literal("IMPACT_REVIEW") }),
  z.object({
    kind: z.literal("IMPACT_FOLLOW_UP_DRAFT"),
    option: z.enum(["FOLLOW_UP_CHANGE", "FUTURE_EVALUATION"]),
  }),
]);

export const journeyAIResponseSchema = z.object({
  message: z.string().trim().min(1).max(6000),
  currentStage: z.enum(JOURNEY_STAGES),
  proposal: z
    .object({
      type: z.enum(PROPOSAL_TYPES),
      payload: z.unknown(),
    })
    .optional(),
  actions: z.array(journeyAIActionSchema).max(8),
  requiresApproval: z.boolean(),
  /**
   * Extensão opcional ao contrato mínimo: novo estado transitório da conversa.
   * `undefined` mantém o estado atual; `null` limpa o rascunho.
   */
  state: journeyConversationStateSchema.nullable().optional(),
});

export type JourneyAIAction = z.infer<typeof journeyAIActionSchema>;
export type JourneyAIResponse = z.infer<typeof journeyAIResponseSchema>;
export type JourneyConversationState = z.infer<typeof journeyConversationStateSchema>;
