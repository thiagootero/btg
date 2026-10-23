import { z } from "zod";
import { figuresComplete, percentageErrors, RESULT_INDICATOR_KINDS, type ResultFigures } from "@/lib/results/indicator";

const text = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label} deve ter no máximo ${max.toLocaleString("pt-BR")} caracteres.`)
    .nullable()
    .optional()
    .transform((v) => (v ? v : null));

const count = z
  .number({ error: "Informe um número." })
  .int("Use um número inteiro.")
  .min(0, "O valor não pode ser negativo.")
  .max(10_000_000, "Valor muito alto.")
  .nullable()
  .optional()
  .transform((v) => v ?? null);

/** Dado alcançado em um indicador do item (id = registro do indicador). */
export interface IndicatorData extends ResultFigures {
  id: string;
}

/** Dados que a organização registra em um item: um dado por indicador e os textos do item. */
export interface ResultData {
  indicators: IndicatorData[];
  teamPerception: string | null;
  additionalContext: string | null;
}

/** Dado de um indicador (rascunho: tudo opcional). */
const indicatorDataSchema = z
  .object({
    id: z.string().min(1).max(64),
    kind: z
      .enum(RESULT_INDICATOR_KINDS)
      .nullable()
      .optional()
      .transform((v) => v ?? null),
    denominator: count,
    numerator: count,
    achievedValue: z
      .number({ error: "Informe um número." })
      .min(0, "O valor não pode ser negativo.")
      .max(1_000_000_000, "Valor muito alto.")
      .nullable()
      .optional()
      .transform((v) => (v === null || v === undefined ? null : Math.round(v * 100) / 100)),
    unit: text(80, "A unidade"),
    achievedText: text(4000, "O resultado apurado"),
  })
  .superRefine((data, ctx) => {
    if (data.kind !== "PERCENTAGE") return;
    for (const [path, message] of Object.entries(percentageErrors(data.numerator, data.denominator))) {
      ctx.addIssue({ code: "custom", path: [path], message });
    }
  })
  .transform((data): IndicatorData => onlyFieldsOfKind(data));

/** Dados que a organização registra em um item (rascunho: tudo opcional). */
export const resultDataSchema = z.object({
  indicators: z.array(indicatorDataSchema).max(30),
  teamPerception: text(4000, "O texto"),
  additionalContext: text(4000, "O contexto"),
});

/** Descarta os campos que não pertencem ao tipo escolhido (evita dados fantasmas). */
export function onlyFieldsOfKind<T extends ResultFigures>(data: T): T {
  const k = data.kind;
  return {
    ...data,
    denominator: k === "PERCENTAGE" ? data.denominator : null,
    numerator: k === "PERCENTAGE" ? data.numerator : null,
    achievedValue: k === "COUNT" ? data.achievedValue : null,
    unit: k === "PERCENTAGE" || k === "COUNT" ? data.unit : null,
    achievedText: k === "TEXT" ? data.achievedText : null,
  };
}

/** Todos os indicadores do item com o dado alcançado completo. */
export function allIndicatorsComplete(data: Pick<ResultData, "indicators">): boolean {
  return data.indicators.length > 0 && data.indicators.every(figuresComplete);
}

const approvedText = z
  .string({ error: "Escreva o texto técnico." })
  .trim()
  .min(1, "Escreva o texto técnico.")
  .max(6000, "O texto deve ter no máximo 6.000 caracteres.");

/** Corpo de PATCH /api/projects/[id]/results/[recordId] */
export const resultRecordActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("save"), data: resultDataSchema }),
  /** Aprova o texto (proposto pela IA, editado ou escrito pela organização). */
  z.object({ action: z.literal("approve"), text: approvedText }),
  /** Descarta a proposta da IA. */
  z.object({ action: z.literal("discard") }),
]);
export type ResultRecordAction = z.infer<typeof resultRecordActionSchema>;

/** Corpo de POST /api/projects/[id]/results/[recordId]/organize */
export const organizeResultSchema = z.object({ data: resultDataSchema });
