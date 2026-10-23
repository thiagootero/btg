/**
 * Formulário personalizado de cada item: as perguntas são redigidas pela IA uma
 * única vez, ao concluir a Jornada — um bloco de perguntas por indicador. Quando
 * a IA não responde (ou responde fora do formato), vale o formulário padrão
 * montado aqui, indicador a indicador.
 */
import { z } from "zod";
import { indicatorSlots, type ItemReference, type ResultSourceType } from "@/lib/results/items";
import { RESULT_INDICATOR_KINDS, suggestIndicatorKind, suggestUnit } from "@/lib/results/indicator";

const question = (max: number) => z.string().trim().min(1).max(max);

/** Perguntas do dado alcançado em um indicador. */
export const indicatorFormSpecSchema = z.object({
  /** Tipo de dado sugerido (a organização pode trocar). */
  kind: z.enum(RESULT_INDICATOR_KINDS),
  /** Quem/o que é contado (famílias, crianças, oficinas…); vazio quando não se aplica. */
  unit: z.string().trim().max(60),
  denominatorQuestion: question(200),
  numeratorQuestion: question(200),
  valueQuestion: question(200),
  textQuestion: question(200),
});

export const resultFormSpecSchema = z.object({
  /** Orientação curta do que registrar neste item. */
  intro: question(400),
  /** Um bloco por indicador, na ordem da Jornada. */
  indicators: z.array(indicatorFormSpecSchema).min(1).max(30),
  /** Ajuda para "O que esse resultado mostra na prática?". */
  perceptionHint: question(300),
  /** Ajuda para o contexto opcional. */
  contextHint: question(300),
});

export type IndicatorFormSpec = z.infer<typeof indicatorFormSpecSchema>;
export type ResultFormSpec = z.infer<typeof resultFormSpecSchema>;

export function defaultIndicatorFormSpec(
  sourceType: ResultSourceType,
  indicator: string | null,
  target: string | null,
): IndicatorFormSpec {
  const kind = sourceType === "IMPACT" && !indicator && !target ? "TEXT" : suggestIndicatorKind(indicator, target);
  const unit = suggestUnit(indicator, target);
  const who = unit || "pessoas ou famílias";
  return {
    kind,
    unit,
    denominatorQuestion: `Quantas ${who} foram avaliadas?`,
    numeratorQuestion: `Quantas ${who} apresentaram a mudança?`,
    valueQuestion: "Qual foi o valor alcançado?",
    textQuestion: "Qual foi o resultado apurado?",
  };
}

export function defaultFormSpec(sourceType: ResultSourceType, ref: ItemReference): ResultFormSpec {
  return {
    intro:
      sourceType === "ACTIVITY"
        ? "Registre o que foi efetivamente realizado nesta atividade até o fim do projeto, em cada indicador."
        : sourceType === "OUTCOME"
          ? "Registre a mudança observada no público ao final do projeto, em cada indicador."
          : "Registre o que já foi possível observar sobre esta mudança de longo prazo.",
    indicators: indicatorSlots(ref).map((name) => defaultIndicatorFormSpec(sourceType, name, ref.target)),
    perceptionHint: "Em linguagem natural, o que a equipe percebeu sobre este resultado.",
    contextHint: "Dificuldades, mudanças de cenário ou outras informações relevantes.",
  };
}

/**
 * Usa o formulário gravado quando válido; caso contrário, o padrão. Se o número
 * de blocos não bate com os indicadores, cada indicador sem bloco usa o padrão.
 */
export function resolveFormSpec(raw: unknown, sourceType: ResultSourceType, ref: ItemReference): ResultFormSpec {
  const fallback = defaultFormSpec(sourceType, ref);
  const parsed = resultFormSpecSchema.safeParse(raw);
  if (!parsed.success) return fallback;
  return {
    ...parsed.data,
    indicators: fallback.indicators.map((d, i) => parsed.data.indicators[i] ?? d),
  };
}
