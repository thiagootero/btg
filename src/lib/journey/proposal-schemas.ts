import { z } from "zod";

/**
 * Schemas do conteúdo estruturado das propostas. São usados:
 * - para validar a resposta de qualquer provedor de IA;
 * - para validar a versão editada pela pessoa antes de aprovar;
 * - para validar edições de conteúdo já aprovado.
 */

const text = (max: number, label: string) =>
  z
    .string({ error: `${label} é obrigatório.` })
    .trim()
    .min(1, `${label} é obrigatório.`)
    .max(max, `${label} deve ter no máximo ${max} caracteres.`);

/** Texto opcional: string vazia vira null ("a definir"). */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Use no máximo ${max} caracteres.`)
    .nullish()
    .transform((v) => (v ? v : null));

export const indicatorSchema = z.object({
  name: text(500, "O nome do indicador"),
  explanation: optionalText(1000),
});

export const evidenceSchema = z.object({
  description: text(500, "O meio de verificação"),
});

// ---------------------------------------------------------------------------
// Atividade
// ---------------------------------------------------------------------------

/**
 * Quando a atividade ocorre em relação ao período oficial do projeto.
 * null = durante o projeto ou não informado. Antes/depois exige esclarecimento.
 */
export const ACTIVITY_PERIODS = ["DURING_PROJECT", "BEFORE_PROJECT", "AFTER_PROJECT"] as const;
export type ActivityPeriod = (typeof ACTIVITY_PERIODS)[number];

export const activityTargetSchema = z.object({
  description: text(1500, "A meta"),
  deadline: optionalText(200),
  /** Duração da atividade em meses; null = a definir. Comparada à duração do projeto. */
  durationMonths: z
    .number({ error: "Informe a duração em meses." })
    .int("Informe a duração em meses inteiros.")
    .min(1, "A duração deve ser de pelo menos 1 mês.")
    .max(600, "Duração muito alta.")
    .nullish()
    .transform((v) => v ?? null),
  period: z
    .enum(ACTIVITY_PERIODS)
    .nullish()
    .transform((v) => v ?? null),
  quantity: z
    .number({ error: "Informe um número válido." })
    .nonnegative("A quantidade não pode ser negativa.")
    .max(9_999_999_999, "Quantidade muito alta.")
    .nullish()
    .transform((v) => v ?? null),
  unit: optionalText(100),
});

/**
 * Ficha de uma atividade. Com `activityId`, detalha (meta, indicadores e
 * verificação) uma atividade já aprovada na lista; sem ele, cria uma nova.
 */
export const activityPayloadSchema = z.object({
  activityId: z.string().min(1).nullish(),
  description: text(1000, "A descrição da atividade"),
  target: activityTargetSchema,
  indicators: z.array(indicatorSchema).min(1, "Inclua pelo menos um indicador.").max(5, "Use no máximo 5 indicadores."),
  evidences: z
    .array(evidenceSchema)
    .min(1, "Inclua pelo menos um meio de verificação.")
    .max(5, "Use no máximo 5 meios de verificação."),
});
export type ActivityPayload = z.infer<typeof activityPayloadSchema>;

/**
 * Mapeamento (Etapa 2.1): a lista de atividades, só as ações, sem metas,
 * indicadores ou verificação. Aprovada a lista, cada atividade é detalhada.
 */
export const activityListPayloadSchema = z.object({
  step: z.literal("LIST"),
  activities: z
    .array(z.object({ description: text(1000, "A atividade") }))
    .min(1, "Inclua pelo menos uma atividade.")
    .max(15, "Use no máximo 15 atividades."),
});
export type ActivityListPayload = z.infer<typeof activityListPayloadSchema>;

/** Proposta do tipo ACTIVITY: a lista de atividades ou a ficha de uma atividade. */
export const activityProposalPayloadSchema = z.union([activityListPayloadSchema, activityPayloadSchema]);
export type ActivityProposalPayload = ActivityListPayload | ActivityPayload;

export function isActivityList(payload: ActivityProposalPayload): payload is ActivityListPayload {
  return "step" in payload && payload.step === "LIST";
}

// ---------------------------------------------------------------------------
// Mudanças esperadas (resultados)
// ---------------------------------------------------------------------------

export const outcomeStatementSchema = z.object({
  statement: text(1000, "A mudança esperada"),
  relatedActivityIds: z.array(z.string().min(1)).min(1, "Relacione a mudança a pelo menos uma atividade."),
});

export const outcomeStatementsPayloadSchema = z.object({
  step: z.literal("STATEMENTS"),
  outcomes: z.array(outcomeStatementSchema).min(1, "Inclua pelo menos uma mudança esperada."),
  /** Marcado pela pessoa quando deseja, expressamente, mais de três mudanças. */
  explicitRequestForMore: z.boolean().default(false),
});

export const outcomeTargetPayloadSchema = z.object({
  step: z.literal("TARGET"),
  outcomeId: z.string().min(1),
  target: text(1000, "A meta"),
});

export const outcomeIndicatorPayloadSchema = z.object({
  step: z.literal("INDICATOR"),
  outcomeId: z.string().min(1),
  indicators: z.array(indicatorSchema).min(1, "Inclua pelo menos um indicador.").max(3, "Use no máximo 3 indicadores."),
  verification: text(500, "A forma de verificação"),
});

/**
 * Ficha completa de um resultado, apresentada depois que a pessoa informa a
 * meta: meta, indicador e verificação aprovados de uma vez. TARGET e INDICATOR
 * continuam aceitos para propostas antigas.
 */
export const outcomeDetailPayloadSchema = z.object({
  step: z.literal("DETAIL"),
  outcomeId: z.string().min(1),
  target: text(1000, "A meta"),
  indicators: z.array(indicatorSchema).min(1, "Inclua pelo menos um indicador.").max(3, "Use no máximo 3 indicadores."),
  verification: text(500, "A forma de verificação"),
});

export const outcomePayloadSchema = z.discriminatedUnion("step", [
  outcomeStatementsPayloadSchema,
  outcomeDetailPayloadSchema,
  outcomeTargetPayloadSchema,
  outcomeIndicatorPayloadSchema,
]);
export type OutcomePayload = z.infer<typeof outcomePayloadSchema>;
export type OutcomeStatementsPayload = z.infer<typeof outcomeStatementsPayloadSchema>;
export type OutcomeTargetPayload = z.infer<typeof outcomeTargetPayloadSchema>;
export type OutcomeIndicatorPayload = z.infer<typeof outcomeIndicatorPayloadSchema>;
export type OutcomeDetailPayload = z.infer<typeof outcomeDetailPayloadSchema>;

// ---------------------------------------------------------------------------
// Impacto de longo prazo
// ---------------------------------------------------------------------------

export const IMPACT_OPTIONS = ["VISION_ONLY", "FOLLOW_UP_CHANGE", "FUTURE_EVALUATION"] as const;
export type ImpactOption = (typeof IMPACT_OPTIONS)[number];

export const impactFollowUpSchema = z.object({
  description: text(1000, "A mudança acompanhada ou avaliação"),
  target: optionalText(1000),
  indicator: optionalText(500),
  verification: optionalText(500),
  periodAfterEnd: optionalText(200),
  notes: optionalText(1500),
});

export const impactStatementPayloadSchema = z.object({
  step: z.literal("STATEMENT"),
  statement: text(1500, "A formulação do impacto"),
});

export const impactFollowUpPayloadSchema = z
  .object({
    step: z.literal("FOLLOW_UP"),
    option: z.enum(IMPACT_OPTIONS),
    followUps: z.array(impactFollowUpSchema).max(5, "Use no máximo 5 acompanhamentos."),
  })
  .superRefine((value, ctx) => {
    if (value.option !== "VISION_ONLY" && value.followUps.length === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["followUps"],
        message: "Inclua pelo menos uma mudança ou avaliação a acompanhar.",
      });
    }
  });

export const impactPayloadSchema = z.discriminatedUnion("step", [
  impactStatementPayloadSchema,
  impactFollowUpPayloadSchema,
]);
export type ImpactPayload = z.infer<typeof impactPayloadSchema>;
export type ImpactFollowUpInput = z.infer<typeof impactFollowUpSchema>;

// ---------------------------------------------------------------------------
// Plano de evidências
// ---------------------------------------------------------------------------

export const EVIDENCE_SOURCE_TYPES = ["ACTIVITY", "OUTCOME", "IMPACT"] as const;

export const evidencePlanOperationalSchema = z.object({
  collectionTiming: optionalText(500),
  responsible: optionalText(190),
  instrument: optionalText(500),
  pending: optionalText(1000),
});

export const evidencePlanItemProposalSchema = evidencePlanOperationalSchema.extend({
  sourceType: z.enum(EVIDENCE_SOURCE_TYPES),
  /** id da atividade, resultado ou acompanhamento de impacto de origem. */
  sourceId: z.string().min(1),
  /** Campos consolidados apenas para exibição; o servidor os recalcula. */
  sourceLabel: z.string().optional(),
  target: z.string().nullish(),
  indicator: z.string().nullish(),
  verification: z.string().nullish(),
});

export const evidencePlanPayloadSchema = z.object({
  items: z.array(evidencePlanItemProposalSchema).min(1, "O plano precisa de pelo menos uma linha."),
});
export type EvidencePlanPayload = z.infer<typeof evidencePlanPayloadSchema>;
export type EvidencePlanItemProposal = z.infer<typeof evidencePlanItemProposalSchema>;

// ---------------------------------------------------------------------------

export const PROPOSAL_TYPES = ["ACTIVITY", "OUTCOME", "IMPACT", "EVIDENCE_PLAN"] as const;
export type ProposalTypeKey = (typeof PROPOSAL_TYPES)[number];

export const proposalPayloadSchemas = {
  ACTIVITY: activityProposalPayloadSchema,
  OUTCOME: outcomePayloadSchema,
  IMPACT: impactPayloadSchema,
  EVIDENCE_PLAN: evidencePlanPayloadSchema,
} as const;

export type ProposalPayloadByType = {
  ACTIVITY: ActivityProposalPayload;
  OUTCOME: OutcomePayload;
  IMPACT: ImpactPayload;
  EVIDENCE_PLAN: EvidencePlanPayload;
};

export type TypedProposal =
  | { type: "ACTIVITY"; payload: ActivityProposalPayload }
  | { type: "OUTCOME"; payload: OutcomePayload }
  | { type: "IMPACT"; payload: ImpactPayload }
  | { type: "EVIDENCE_PLAN"; payload: EvidencePlanPayload };

export function parseProposalPayload(type: ProposalTypeKey, payload: unknown): TypedProposal {
  switch (type) {
    case "ACTIVITY":
      return { type, payload: activityProposalPayloadSchema.parse(payload) };
    case "OUTCOME":
      return { type, payload: outcomePayloadSchema.parse(payload) };
    case "IMPACT":
      return { type, payload: impactPayloadSchema.parse(payload) };
    case "EVIDENCE_PLAN":
      return { type, payload: evidencePlanPayloadSchema.parse(payload) };
  }
}

export const PROPOSAL_STAGE: Record<ProposalTypeKey, "ACTIVITIES" | "OUTCOMES" | "IMPACT" | "EVIDENCE_PLAN"> = {
  ACTIVITY: "ACTIVITIES",
  OUTCOME: "OUTCOMES",
  IMPACT: "IMPACT",
  EVIDENCE_PLAN: "EVIDENCE_PLAN",
};

export const IMPACT_OPTION_LABELS: Record<ImpactOption, string> = {
  VISION_ONLY: "Manter como visão de longo prazo",
  FOLLOW_UP_CHANGE: "Acompanhar uma mudança depois do projeto",
  FUTURE_EVALUATION: "Planejar uma avaliação futura",
};
