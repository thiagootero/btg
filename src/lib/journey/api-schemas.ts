import { z } from "zod";
import { JOURNEY_STAGES } from "@/lib/journey/stages";
import {
  activityPayloadSchema,
  evidencePlanOperationalSchema,
  impactFollowUpSchema,
  IMPACT_OPTIONS,
  indicatorSchema,
} from "@/lib/journey/proposal-schemas";

/** Corpo de POST /api/projects/[id]/journey/messages */
export const journeyInputSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("start") }),
  z.object({
    type: z.literal("message"),
    text: z
      .string({ error: "Escreva uma mensagem." })
      .trim()
      .min(1, "Escreva uma mensagem.")
      .max(4000, "A mensagem deve ter no máximo 4.000 caracteres."),
  }),
  z.object({ type: z.literal("action"), actionId: z.string().trim().min(1).max(100) }),
  /** Repete o último turno em que o consultor falhou, sem duplicar a mensagem. */
  z.object({ type: z.literal("retry") }),
]);
export type JourneyInput = z.infer<typeof journeyInputSchema>;

/** Corpo de POST /api/projects/[id]/journey/proposals/[proposalId] */
export const proposalDecisionSchema = z.discriminatedUnion("decision", [
  z.object({
    decision: z.literal("APPROVE"),
    /** Versão editada pela pessoa; se ausente, aprova o conteúdo original. */
    payload: z.unknown().optional(),
  }),
  z.object({ decision: z.literal("REJECT") }),
]);
export type ProposalDecision = z.infer<typeof proposalDecisionSchema>;

/** Corpo de POST /api/projects/[id]/journey/stages */
export const stageChangeSchema = z.object({
  stage: z.enum(JOURNEY_STAGES),
  action: z.enum(["approve", "reopen"]),
  /** Reabrir uma etapa aprovada exige confirmação explícita. */
  confirm: z.boolean().optional(),
});

/** Substituir conteúdo aprovado exige confirmação explícita. */
const confirmReplace = z.literal(true, { error: "Confirme que deseja substituir a versão aprovada." });

export const activityEditSchema = activityPayloadSchema.extend({ confirmReplace });

export const outcomeEditSchema = z.object({
  statement: z.string().trim().min(1, "Descreva a mudança esperada.").max(1000),
  relatedActivityIds: z.array(z.string().min(1)).min(1, "Relacione a mudança a pelo menos uma atividade."),
  target: z.string().trim().max(1000).nullish().transform((v) => v || null),
  indicators: z.array(indicatorSchema).max(3, "Use no máximo 3 indicadores."),
  verification: z.string().trim().max(500).nullish().transform((v) => v || null),
  confirmReplace,
});

export const impactEditSchema = z.object({
  statement: z.string().trim().min(1, "Descreva o impacto de longo prazo.").max(1500),
  followUpOption: z.enum(IMPACT_OPTIONS).nullable(),
  followUps: z.array(impactFollowUpSchema).max(5),
  confirmReplace,
});

export const evidencePlanItemEditSchema = evidencePlanOperationalSchema;

export const deleteConfirmSchema = z.object({ confirm: z.literal(true, { error: "Confirme a exclusão." }) });
