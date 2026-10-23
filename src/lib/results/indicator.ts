/**
 * Tipos de indicador e cálculo do dado alcançado (funções puras).
 *
 * O tipo é sugerido a partir do texto do indicador e da meta, mas a decisão
 * final é da organização: ela escolhe o tipo no primeiro preenchimento.
 */
import { normalize } from "@/lib/journey/rules";

export const RESULT_INDICATOR_KINDS = ["PERCENTAGE", "COUNT", "TEXT"] as const;
export type ResultIndicatorKind = (typeof RESULT_INDICATOR_KINDS)[number];

export const INDICATOR_KIND_LABELS: Record<ResultIndicatorKind, string> = {
  PERCENTAGE: "Percentual",
  COUNT: "Número (contagem)",
  TEXT: "Texto (resultado não numérico)",
};

export const INDICATOR_KIND_HINTS: Record<ResultIndicatorKind, string> = {
  PERCENTAGE: "Informe quantos foram avaliados e quantos apresentaram a mudança; o percentual é calculado.",
  COUNT: "Informe o valor alcançado e a unidade (famílias, pessoas, oficinas, horas…).",
  TEXT: "Descreva o resultado apurado quando não houver número ou percentual.",
};

const PERCENT_HINTS = /%|\bpercentual\b|\bporcentagem\b|\bproporcao\b|\btaxa\b|\bparcela\b|\bpor cento\b/;
const COUNT_HINTS = /\bnumero de\b|\bquantidade de\b|\btotal de\b|\bquantas?\b|\bquantos?\b|\bnº\b/;

/** Sugestão inicial do tipo; nunca é definitiva. */
export function suggestIndicatorKind(indicator: string | null, target: string | null): ResultIndicatorKind {
  const ind = normalize(indicator ?? "");
  const tgt = normalize(target ?? "");
  if (PERCENT_HINTS.test(ind)) return "PERCENTAGE";
  if (COUNT_HINTS.test(ind)) return "COUNT";
  if (PERCENT_HINTS.test(tgt)) return "PERCENTAGE";
  if (COUNT_HINTS.test(tgt) || /\d/.test(tgt)) return "COUNT";
  return "TEXT";
}

const UNIT_WORDS = [
  "famílias",
  "pessoas",
  "participantes",
  "jovens",
  "crianças",
  "adolescentes",
  "mulheres",
  "agricultores",
  "agricultoras",
  "estudantes",
  "alunos",
  "educadores",
  "professores",
  "oficinas",
  "encontros",
  "horas",
  "atendimentos",
];

/** Unidade provável (ex.: "famílias") a partir do indicador e da meta. */
export function suggestUnit(indicator: string | null, target: string | null): string {
  const text = `${indicator ?? ""} ${target ?? ""}`.toLowerCase();
  const found = UNIT_WORDS.map((w) => ({ w, i: text.indexOf(w) }))
    .filter((x) => x.i >= 0)
    .sort((a, b) => a.i - b.i)[0];
  return found?.w ?? "";
}

/** Erros de consistência de um indicador percentual (vazio = válido). */
export function percentageErrors(numerator: number | null, denominator: number | null): Record<string, string> {
  const errors: Record<string, string> = {};
  if (denominator !== null && denominator <= 0) errors.denominator = "A quantidade avaliada deve ser maior que zero.";
  if (numerator !== null && numerator < 0) errors.numerator = "A quantidade não pode ser negativa.";
  if (numerator !== null && denominator !== null && denominator > 0 && numerator > denominator) {
    errors.numerator = "A quantidade que apresentou a mudança não pode ser maior que a quantidade avaliada.";
  }
  return errors;
}

/**
 * Percentual calculado pelo sistema, com uma casa decimal (arredondamento
 * meio para cima). null quando os dados estão incompletos ou inválidos.
 */
export function computePercentage(numerator: number | null, denominator: number | null): number | null {
  if (numerator === null || denominator === null) return null;
  if (!Number.isInteger(numerator) || !Number.isInteger(denominator)) return null;
  if (Object.keys(percentageErrors(numerator, denominator)).length > 0) return null;
  // Aritmética inteira para evitar erros de ponto flutuante (22/32 = 68,75 → 68,8).
  return Math.round((numerator * 1000) / denominator) / 10;
}

/** Número no formato brasileiro: 1.234,5 (sem casas decimais quando inteiro). */
export function formatNumberPt(value: number, maxDecimals = 2): string {
  const fixed = Number.isInteger(value)
    ? String(value)
    : value.toFixed(maxDecimals).replace(/0+$/, "").replace(/\.$/, "");
  const [int, dec] = fixed.split(".");
  const sign = int.startsWith("-") ? "-" : "";
  const digits = sign ? int.slice(1) : int;
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${sign}${grouped}${dec ? `,${dec}` : ""}`;
}

/** "68,8%" */
export function formatPercentage(value: number): string {
  return `${formatNumberPt(value, 1)}%`;
}

/** Dados registrados de um resultado (sem os textos). */
export interface ResultFigures {
  kind: ResultIndicatorKind | null;
  denominator: number | null;
  numerator: number | null;
  achievedValue: number | null;
  unit: string | null;
  achievedText: string | null;
}

/** true quando o dado alcançado está completo para o tipo escolhido. */
export function figuresComplete(f: ResultFigures): boolean {
  switch (f.kind) {
    case "PERCENTAGE":
      return computePercentage(f.numerator, f.denominator) !== null;
    case "COUNT":
      return f.achievedValue !== null && f.achievedValue >= 0;
    case "TEXT":
      return Boolean(f.achievedText?.trim());
    default:
      return false;
  }
}

/** Resumo do dado alcançado para exibição (ex.: "22 de 32 famílias avaliadas (68,8%)"). */
export function achievedSummary(f: ResultFigures): string | null {
  if (!figuresComplete(f)) return null;
  const unit = f.unit?.trim();
  switch (f.kind) {
    case "PERCENTAGE": {
      const pct = computePercentage(f.numerator, f.denominator) as number;
      return `${formatPercentage(pct)} do total avaliado (${formatNumberPt(f.numerator!)} de ${formatNumberPt(f.denominator!)}${unit ? ` ${unit}` : ""})`;
    }
    case "COUNT":
      return `${formatNumberPt(f.achievedValue!)}${unit ? ` ${unit}` : ""}`;
    case "TEXT":
      return f.achievedText!.trim();
    default:
      return null;
  }
}
