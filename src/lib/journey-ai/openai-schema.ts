/**
 * Schema JSON estrito (Structured Outputs) da resposta do consultor quando o
 * provedor é a OpenAI. Espelha o contrato de response-schema.ts e os formatos
 * de proposal-schemas.ts, com as restrições do modo estrito:
 * - todo objeto declara todas as propriedades em `required` e
 *   `additionalProperties: false`;
 * - campos opcionais viram `anyOf [..., null]`.
 *
 * Por isso a saída do modelo tem duas convenções que `fromOpenAIOutput`
 * converte para o contrato do sistema:
 * - `proposal: null` quando não há proposta (no contrato: ausente);
 * - `state: { "kind": "KEEP" }` para manter o rascunho atual (no contrato:
 *   ausente); `state: null` limpa o rascunho, como no contrato.
 *
 * O schema só guia o modelo: a resposta é validada de novo com Zod no servidor
 * (journeyAIResponseSchema e o schema do tipo da proposta).
 */
import { JOURNEY_STAGES } from "@/lib/journey/stages";
import { ACTIVITY_PERIODS, EVIDENCE_SOURCE_TYPES, IMPACT_OPTIONS } from "@/lib/journey/proposal-schemas";
import { ACTION_INTENTS, journeyAIResponseSchema, type JourneyAIResponse } from "@/lib/journey-ai/response-schema";

type JsonSchema = Record<string, unknown>;

const str = (description?: string): JsonSchema => ({ type: "string", ...(description && { description }) });
const literal = (value: string): JsonSchema => ({ type: "string", enum: [value] });
const oneOf = (values: readonly string[], description?: string): JsonSchema => ({
  type: "string",
  enum: [...values],
  ...(description && { description }),
});
const nullable = (schema: JsonSchema): JsonSchema => ({ anyOf: [schema, { type: "null" }] });
const list = (items: JsonSchema, description?: string): JsonSchema => ({
  type: "array",
  items,
  ...(description && { description }),
});
/** Objeto estrito: todas as propriedades obrigatórias, nenhuma extra. */
const obj = (properties: Record<string, JsonSchema>, description?: string): JsonSchema => ({
  type: "object",
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
  ...(description && { description }),
});

const TO_DEFINE = "Use null quando a informação não foi dada (fica “a definir”). Nunca invente.";

const indicator = obj({ name: str(), explanation: nullable(str()) });

const activityList = obj(
  {
    step: literal("LIST"),
    activities: list(
      obj({ description: str("Ação concreta da equipe, começando por verbo no infinitivo. Sem meta.") }),
      "Atividades novas (ainda não aprovadas), sem quantidades, indicadores ou verificação.",
    ),
  },
  "Etapa 2.1 — mapeamento: a lista de atividades para validação.",
);

const activityPayload = obj(
  {
    activityId: nullable(str("id da atividade da lista aprovada que está sendo detalhada.")),
    description: str("Ação concreta da equipe, começando por verbo no infinitivo."),
    target: obj({
      description: str("Quanto será ofertado, para quem e até quando."),
      deadline: nullable(str(TO_DEFINE)),
      quantity: nullable({ type: "number", description: TO_DEFINE }),
      unit: nullable(str()),
      durationMonths: nullable({
        type: "integer",
        description:
          "Duração da atividade em meses, como número inteiro (ex.: 10). Nunca maior que a duração do projeto. null se não foi informada.",
      }),
      period: nullable(
        oneOf(
          ACTIVITY_PERIODS,
          "DURING_PROJECT dentro do período do projeto; BEFORE_PROJECT ou AFTER_PROJECT só se a pessoa disse que é antes do início ou depois do encerramento. null se não foi informado.",
        ),
      ),
    }),
    indicators: list(indicator, "De 1 a 5 indicadores."),
    evidences: list(obj({ description: str() }), "De 1 a 5 meios de verificação."),
  },
  "Etapa 2.3 — ficha de UMA atividade da lista aprovada, depois que a pessoa informou o que será ofertado.",
);

const outcomeStatements = obj(
  {
    step: literal("STATEMENTS"),
    outcomes: list(
      obj({
        statement: str("Mudança no público, com verbo concreto e observável."),
        relatedActivityIds: list(str(), "ids das atividades aprovadas que sustentam a mudança."),
      }),
      "No máximo 3, salvo pedido expresso.",
    ),
    explicitRequestForMore: { type: "boolean", description: "true só se a pessoa pediu expressamente mais de 3." },
  },
  "Passo 1 dos resultados de médio prazo: as mudanças esperadas.",
);

const outcomeDetail = obj(
  {
    step: literal("DETAIL"),
    outcomeId: str("id do resultado aprovado."),
    target: str(
      "Frase completa: \"Até o final do projeto, [número OU percentual, exatamente como a pessoa informou] [público] [mudança observável].\"",
    ),
    indicators: list(indicator, "De 1 a 3 indicadores."),
    verification: str("Nome sintético de um documento ou registro que observe a mudança."),
  },
  "Passo 2 dos resultados: ficha do resultado, enviada só depois que a pessoa informar a meta.",
);

const impactStatement = obj(
  { step: literal("STATEMENT"), statement: str("Impacto formulado como contribuição de longo prazo.") },
  "Passo 1 do impacto: a formulação.",
);

const impactFollowUp = obj(
  {
    step: literal("FOLLOW_UP"),
    option: oneOf(IMPACT_OPTIONS),
    followUps: list(
      obj({
        description: str("Mudança acompanhada ou objeto da avaliação futura."),
        target: nullable(str(TO_DEFINE)),
        indicator: nullable(str(TO_DEFINE)),
        verification: nullable(str(TO_DEFINE)),
        periodAfterEnd: nullable(str("Período após o fim do projeto.")),
        notes: nullable(str()),
      }),
      "Vazio quando option é VISION_ONLY.",
    ),
  },
  "Passo 2 do impacto: forma de acompanhamento.",
);

const evidencePlanPayload = obj({
  items: list(
    obj({
      sourceType: oneOf(EVIDENCE_SOURCE_TYPES),
      sourceId: str(),
      collectionTiming: nullable(str()),
      responsible: nullable(str(TO_DEFINE)),
      instrument: nullable(str()),
      pending: nullable(str()),
    }),
  ),
});

/** Cada tipo de proposta só aceita os formatos de payload do próprio tipo. */
const proposal = nullable({
  anyOf: [
    obj({ type: literal("ACTIVITY"), payload: { anyOf: [activityList, activityPayload] } }),
    obj({ type: literal("OUTCOME"), payload: { anyOf: [outcomeStatements, outcomeDetail] } }),
    obj({ type: literal("IMPACT"), payload: { anyOf: [impactStatement, impactFollowUp] } }),
    obj({ type: literal("EVIDENCE_PLAN"), payload: evidencePlanPayload }),
  ],
});

const state = {
  anyOf: [
    obj({ kind: literal("KEEP") }, "Mantém o rascunho atual sem alteração."),
    obj({
      kind: literal("ACTIVITY_DRAFT"),
      step: oneOf(["CONFIRM_DESCRIPTION", "ASK_TARGET"]),
      description: str(),
      target: nullable(str("Meta que a pessoa já informou para esta atividade (texto), ou null.")),
      activityId: nullable(str("id da atividade da lista aprovada em detalhamento.")),
    }),
    obj({ kind: literal("ACTIVITIES_REVIEW") }),
    obj({ kind: literal("OUTCOMES_REVIEW") }),
    obj({ kind: literal("IMPACT_REVIEW") }),
    obj({ kind: literal("IMPACT_FOLLOW_UP_DRAFT"), option: oneOf(["FOLLOW_UP_CHANGE", "FUTURE_EVALUATION"]) }),
    { type: "null", description: "Limpa o rascunho." },
  ],
};

export const OPENAI_RESPONSE_SCHEMA: JsonSchema = obj({
  message: str("Mensagem curta à pessoa usuária, em português do Brasil (markdown simples)."),
  currentStage: oneOf(JOURNEY_STAGES),
  proposal,
  actions: list(obj({ id: str(), label: str(), intent: oneOf(ACTION_INTENTS) }), "No máximo 8 opções."),
  requiresApproval: { type: "boolean" },
  state,
});

export const OPENAI_RESPONSE_FORMAT = {
  type: "json_schema" as const,
  name: "journey_ai_response",
  strict: true,
  schema: OPENAI_RESPONSE_SCHEMA,
};

/** Orientação adicional ao modelo sobre as convenções do formato estrito. */
export const OPENAI_FORMAT_NOTES = `
# Formato estruturado desta integração
- Use "proposal": null quando não houver proposta.
- Use "state": {"kind": "KEEP"} para manter o rascunho atual e "state": null para limpá-lo.
- Campos de texto opcionais sem informação: null ("a definir"). Nunca invente dados.
- Os ids (atividades, resultados) vêm do contexto do projeto; nunca crie ids.
- Etapa 2, na ordem das instruções:
  2.1 Mapeamento: a lista de atividades vai em "proposal" ACTIVITY com step "LIST" (só as
      ações, sem metas, indicadores ou verificação). Para acrescentar atividades depois,
      envie outra LIST só com as novas.
  2.2 Detalhamento: com a lista aprovada (atividades no contexto), trabalhe uma atividade
      por vez, na ordem, e pergunte o que será ofertado; guarde em "state" um
      ACTIVITY_DRAFT com step "ASK_TARGET", "activityId" e "description" da atividade.
  2.3 Ficha: depois da resposta da pessoa, envie a ficha em "proposal" ACTIVITY com o
      "activityId" da atividade, montando a meta somente com o que foi informado. Não
      mencione na meta o que a pessoa decidiu não definir; campos numéricos sem
      informação ficam null. Indicadores e meios de verificação: pelo menos um de cada.
  Nunca envie ficha de atividade antes de a lista estar aprovada.
- Nunca volte a pedir uma informação que a pessoa disse que não vai definir.
- Toda ficha apresentada na mensagem deve ir também em "proposal": ficha só em texto
  não é registrada e não pode ser aprovada.
- Enquanto ainda estiver perguntando, use "proposal": null e "requiresApproval": false,
  e guarde o rascunho em "state".
- Não crie ações "navigate:"; o sistema oferece os links de navegação.
`;

/**
 * Converte a saída do modelo para o contrato do sistema e valida com Zod.
 * Lança erro (ZodError) se a resposta não respeitar o contrato.
 */
export function fromOpenAIOutput(output: unknown): JourneyAIResponse {
  const raw = (output ?? {}) as Record<string, unknown>;
  const { proposal: rawProposal, state: rawState, ...rest } = raw;
  const keep = typeof rawState === "object" && rawState !== null && (rawState as { kind?: unknown }).kind === "KEEP";
  return journeyAIResponseSchema.parse({
    ...rest,
    ...(rawProposal !== null && rawProposal !== undefined && { proposal: rawProposal }),
    ...(!keep && rawState !== undefined && { state: rawState }),
  });
}
