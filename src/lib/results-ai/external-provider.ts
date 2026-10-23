/**
 * Texto técnico do resultado com a OpenAI (Responses API + Structured Outputs).
 *
 * A IA apenas PROPÕE um texto: o servidor valida o formato, aplica as travas
 * de números e de linguagem (text-guards.ts) e grava a proposta como pendente.
 * Nada é aprovado ou publicado automaticamente.
 */
import "server-only";
import OpenAI from "openai";
import { z } from "zod";
import {
  hasForeignScript,
  JourneyAIProviderError,
  toProviderError,
  type ExternalProviderConfig,
  type ResponsesClient,
} from "@/lib/journey-ai/external-provider";
import { RESULT_INDICATOR_KINDS } from "@/lib/results/indicator";
import { resultFormSpecSchema, type ResultFormSpec } from "@/lib/results/form-spec";
import { checkResultText } from "@/lib/results-ai/text-guards";
import {
  buildFormUserContent,
  buildResultUserContent,
  RESULTS_FORM_PROMPT,
  RESULTS_SYSTEM_PROMPT,
} from "@/lib/results-ai/system-prompt";
import type {
  ResultFormRequest,
  ResultFormResponse,
  ResultTextProvider,
  ResultTextRequest,
  ResultTextResponse,
  ResultTextUsage,
} from "@/lib/results-ai/types";

/** Texto de até ~180 palavras, com folga para o raciocínio do modelo. */
export const RESULT_MAX_OUTPUT_TOKENS = 1500;

const NOTHING_CHANGED = "Nenhum dado registrado foi alterado.";

export const RESULT_TEXT_FORMAT = {
  type: "json_schema" as const,
  name: "result_technical_text",
  strict: true,
  schema: {
    type: "object",
    properties: { texto: { type: "string", description: "Parágrafo técnico e analítico, 4 a 6 frases." } },
    required: ["texto"],
    additionalProperties: false,
  },
};

const outputSchema = z.object({ texto: z.string().trim().min(1).max(3000) });

/** Perguntas de cada item: até ~400 tokens por item (vários indicadores). */
export const FORM_MAX_OUTPUT_TOKENS = 12000;

const formQuestion = { type: "string" };
export const RESULT_FORM_FORMAT = {
  type: "json_schema" as const,
  name: "result_forms",
  strict: true,
  schema: {
    type: "object",
    properties: {
      itens: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            intro: formQuestion,
            indicadores: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  kind: { type: "string", enum: [...RESULT_INDICATOR_KINDS] },
                  unit: { type: "string" },
                  denominatorQuestion: formQuestion,
                  numeratorQuestion: formQuestion,
                  valueQuestion: formQuestion,
                  textQuestion: formQuestion,
                },
                required: ["kind", "unit", "denominatorQuestion", "numeratorQuestion", "valueQuestion", "textQuestion"],
                additionalProperties: false,
              },
            },
            perceptionHint: formQuestion,
            contextHint: formQuestion,
          },
          required: ["id", "intro", "indicadores", "perceptionHint", "contextHint"],
          additionalProperties: false,
        },
      },
    },
    required: ["itens"],
    additionalProperties: false,
  },
};

const hasForeignText = (value: unknown): boolean =>
  typeof value === "string"
    ? hasForeignScript(value)
    : Array.isArray(value)
      ? value.some(hasForeignText)
      : typeof value === "object" && value !== null && Object.values(value).some(hasForeignText);

/**
 * Converte a saída do modelo em formulários válidos. Itens com id desconhecido,
 * com número de blocos diferente do número de indicadores, texto de outro
 * alfabeto ou fora do schema são ignorados (ficam com o padrão).
 */
export function parseFormOutput(outputText: string, request: ResultFormRequest): Record<string, ResultFormSpec> {
  const expected = new Map(request.items.map((i) => [i.id, Math.max(i.indicators.length, 1)]));
  const parsed = z.object({ itens: z.array(z.unknown()) }).parse(JSON.parse(outputText));
  const forms: Record<string, ResultFormSpec> = {};
  for (const raw of parsed.itens) {
    const item = (raw ?? {}) as { id?: unknown; indicadores?: unknown };
    if (typeof item.id !== "string" || !expected.has(item.id)) continue;
    const spec = resultFormSpecSchema.safeParse({ ...item, indicators: item.indicadores });
    if (!spec.success || spec.data.indicators.length !== expected.get(item.id)) continue;
    if (hasForeignText(spec.data)) continue;
    forms[item.id] = spec.data;
  }
  return forms;
}

export interface ExternalResultOptions {
  client?: ResponsesClient;
  recordUsage?: (usage: ResultTextUsage) => Promise<void>;
}

export class ExternalResultTextProvider implements ResultTextProvider {
  readonly name = "external";
  readonly isMock = false;
  private readonly client: ResponsesClient;

  constructor(
    private readonly config: ExternalProviderConfig,
    private readonly options: ExternalResultOptions = {},
  ) {
    this.client = options.client ?? new OpenAI({ apiKey: config.apiKey, maxRetries: 0, timeout: config.timeoutMs });
  }

  async organize(request: ResultTextRequest): Promise<ResultTextResponse> {
    let inputTokens = 0;
    let outputTokens = 0;
    try {
      const response = await this.client.responses.create(
        {
          model: this.config.model,
          instructions: RESULTS_SYSTEM_PROMPT,
          input: [
            {
              role: "user" as const,
              content: `Dados informados pela organização (JSON):\n${buildResultUserContent(request)}`,
            },
          ],
          text: { format: RESULT_TEXT_FORMAT },
          max_output_tokens: RESULT_MAX_OUTPUT_TOKENS,
          store: false,
          ...(this.config.reasoningEffort && { reasoning: { effort: this.config.reasoningEffort } }),
        },
        { maxRetries: 0, timeout: this.config.timeoutMs },
      );
      inputTokens = response.usage?.input_tokens ?? 0;
      outputTokens = response.usage?.output_tokens ?? 0;

      if (response.status === "incomplete") {
        throw new JourneyAIProviderError(
          `A proposta de texto ficou incompleta. ${NOTHING_CHANGED} Tente novamente.`,
          "INCOMPLETE",
          `resposta incompleta (${response.incomplete_details?.reason ?? "motivo não informado"})`,
        );
      }
      const refusal = response.output
        .flatMap((item) => (item.type === "message" ? item.content : []))
        .find((part) => part.type === "refusal");
      if (refusal) {
        throw new JourneyAIProviderError(
          `A IA não pôde organizar este resultado. ${NOTHING_CHANGED}`,
          "REFUSED",
          "o modelo recusou a solicitação",
        );
      }

      let text: string;
      try {
        text = outputSchema.parse(JSON.parse(response.output_text)).texto;
      } catch (error) {
        throw new JourneyAIProviderError(
          `A IA respondeu em um formato inesperado. ${NOTHING_CHANGED} Tente novamente.`,
          "INVALID_RESPONSE",
          `resposta fora do contrato: ${error instanceof Error ? error.message.slice(0, 300) : "erro desconhecido"}`,
        );
      }
      if (hasForeignScript(text)) {
        throw new JourneyAIProviderError(
          `A IA gerou um texto com caracteres inválidos. ${NOTHING_CHANGED} Tente novamente.`,
          "INVALID_RESPONSE",
          "resposta com caracteres de outro alfabeto",
        );
      }
      const guard = checkResultText(text, request);
      if (!guard.ok) {
        throw new JourneyAIProviderError(
          `A proposta da IA alterava os números registrados ou usava afirmações não sustentadas pelos dados, por isso foi descartada. ${NOTHING_CHANGED} Tente novamente.`,
          "INVALID_RESPONSE",
          `texto recusado pelas travas: ${guard.problems.join("; ").slice(0, 500)}`,
        );
      }

      await this.record({ inputTokens, outputTokens, status: "SUCCESS" });
      return { text };
    } catch (error) {
      const failure = toProviderError(error);
      await this.record({ inputTokens, outputTokens, status: failure.status });
      throw failure;
    }
  }

  async generateForms(request: ResultFormRequest): Promise<ResultFormResponse> {
    let inputTokens = 0;
    let outputTokens = 0;
    try {
      const response = await this.client.responses.create(
        {
          model: this.config.model,
          instructions: RESULTS_FORM_PROMPT,
          input: [{ role: "user" as const, content: `Jornada aprovada (JSON):\n${buildFormUserContent(request)}` }],
          text: { format: RESULT_FORM_FORMAT },
          max_output_tokens: FORM_MAX_OUTPUT_TOKENS,
          store: false,
          ...(this.config.reasoningEffort && { reasoning: { effort: this.config.reasoningEffort } }),
        },
        // Várias perguntas em uma só chamada: mais tempo que uma resposta comum.
        { maxRetries: 0, timeout: Math.max(this.config.timeoutMs, 120_000) },
      );
      inputTokens = response.usage?.input_tokens ?? 0;
      outputTokens = response.usage?.output_tokens ?? 0;
      if (response.status === "incomplete") {
        throw new JourneyAIProviderError(
          "As perguntas personalizadas ficaram incompletas.",
          "INCOMPLETE",
          `resposta incompleta (${response.incomplete_details?.reason ?? "motivo não informado"})`,
        );
      }
      let forms: Record<string, ResultFormSpec>;
      try {
        forms = parseFormOutput(response.output_text, request);
      } catch (error) {
        throw new JourneyAIProviderError(
          "A IA respondeu em um formato inesperado.",
          "INVALID_RESPONSE",
          `formulário fora do contrato: ${error instanceof Error ? error.message.slice(0, 300) : "erro desconhecido"}`,
        );
      }
      await this.record({ inputTokens, outputTokens, status: "SUCCESS" });
      return { forms };
    } catch (error) {
      const failure = toProviderError(error);
      await this.record({ inputTokens, outputTokens, status: failure.status });
      throw failure;
    }
  }

  private async record(usage: Omit<ResultTextUsage, "model">) {
    try {
      await this.options.recordUsage?.({ model: this.config.model, ...usage });
    } catch (error) {
      console.error("[results-ai] falha ao registrar uso da IA", error instanceof Error ? error.message : error);
    }
  }
}
