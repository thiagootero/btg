/**
 * Travas aplicadas no servidor ao texto técnico proposto pela IA. Não dependem
 * do prompt: qualquer texto (mock ou provedor externo) passa por elas antes de
 * ser gravado como proposta.
 *
 * 1. Números: todo número do texto precisa existir nos dados informados pela
 *    organização (ou ser o percentual calculado pelo sistema), e os números
 *    registrados precisam aparecer intactos.
 * 2. Linguagem: termos de certeza ou de efeito amplo ("transformou",
 *    "comprovou"...) só são aceitos se a própria organização os usou.
 */
import { normalize } from "@/lib/journey/rules";
import { computePercentage } from "@/lib/results/indicator";
import type { ResultTextRequest } from "@/lib/results-ai/types";

const NUMBER = /\d+(?:[.,]\d+)*/g;

/**
 * Interpretações numéricas de um trecho como "1.200", "68,8" ou "68.8".
 * Trechos ambíguos ("1.200") valem nas duas leituras.
 */
export function numberReadings(token: string): number[] {
  if (token.includes(",")) {
    const value = Number(token.replace(/\./g, "").replace(",", "."));
    return Number.isFinite(value) ? [value] : [];
  }
  const readings: number[] = [];
  if (/^\d{1,3}(\.\d{3})+$/.test(token)) readings.push(Number(token.replace(/\./g, "")));
  if ((token.match(/\./g) ?? []).length <= 1) readings.push(Number(token));
  return readings.filter(Number.isFinite);
}

export function extractNumbers(text: string): number[][] {
  return (text.match(NUMBER) ?? []).map(numberReadings).filter((r) => r.length > 0);
}

const same = (a: number, b: number) => Math.abs(a - b) < 1e-9;

/** Textos fornecidos pela organização (e pela Jornada aprovada) que vão à IA. */
export function sourceTexts(request: ResultTextRequest): string[] {
  return [
    request.project.name,
    request.project.targetAudience,
    request.project.problem,
    request.project.territory,
    request.project.strategy ?? "",
    ...request.logic.contributesTo,
    ...request.logic.builtOn,
    request.logic.impact ?? "",
    request.item,
    request.target ?? "",
    request.baseline ?? "",
    ...request.indicators.flatMap((i) => [i.indicator ?? "", i.unit ?? "", i.achievedText ?? ""]),
    request.teamPerception ?? "",
    request.additionalContext ?? "",
  ];
}

/** Números permitidos no texto: os registrados, o percentual calculado e os citados nos dados de origem. */
export function allowedNumbers(request: ResultTextRequest): number[] {
  const values: number[] = [request.project.durationMonths];
  for (const r of request.indicators) {
    for (const v of [r.numerator, r.denominator, r.achievedValue, r.percentage]) {
      if (v !== null) values.push(v);
    }
  }
  for (const text of sourceTexts(request)) values.push(...extractNumbers(text).flat());
  return values;
}

/** Números que obrigatoriamente aparecem no texto, sem alteração (de todos os indicadores). */
export function requiredNumbers(request: ResultTextRequest): number[] {
  return request.indicators.flatMap((r) => {
    if (r.kind === "PERCENTAGE") {
      return [r.numerator, r.denominator, r.percentage].filter((v): v is number => v !== null);
    }
    if (r.kind === "COUNT" && r.achievedValue !== null) return [r.achievedValue];
    return [];
  });
}

/** Termos de certeza ou de efeito amplo que a IA não pode introduzir. */
export const OVERSTATED_TERMS = [
  "transform",
  "elimin",
  "garant",
  "comprov",
  "erradic",
  "revolucion",
  "solucionou",
  "resolveu",
  "acabou com",
  "sem duvida",
  "certamente",
] as const;

export interface TextGuardResult {
  ok: boolean;
  problems: string[];
}

export function checkResultText(text: string, request: ResultTextRequest): TextGuardResult {
  const problems: string[] = [];
  const allowed = allowedNumbers(request);
  const found = extractNumbers(text);

  for (const readings of found) {
    if (!readings.some((r) => allowed.some((a) => same(a, r)))) {
      problems.push(`número não informado pela organização: ${readings[0]}`);
    }
  }
  for (const required of requiredNumbers(request)) {
    if (!found.some((readings) => readings.some((r) => same(r, required)))) {
      problems.push(`número registrado ausente ou alterado: ${required}`);
    }
  }
  // Os percentuais calculados não podem ser trocados por outro valor percentual.
  const expected = request.indicators
    .filter((r) => r.kind === "PERCENTAGE")
    .map((r) => computePercentage(r.numerator, r.denominator))
    .filter((v): v is number => v !== null);
  if (expected.length > 0) {
    const percents = (text.match(/\d+(?:[.,]\d+)*\s*%/g) ?? []).flatMap((p) => numberReadings(p.replace(/\s*%$/, "")));
    const sourcePercents = sourceTexts(request).flatMap((t) =>
      (t.match(/\d+(?:[.,]\d+)*\s*%/g) ?? []).flatMap((p) => numberReadings(p.replace(/\s*%$/, ""))),
    );
    for (const p of percents) {
      if (!expected.some((e) => same(p, e)) && !sourcePercents.some((s) => same(s, p))) {
        problems.push(`percentual diferente do calculado: ${p}`);
      }
    }
  }

  const normalizedText = normalize(text);
  const normalizedSources = normalize(sourceTexts(request).join(" "));
  for (const term of OVERSTATED_TERMS) {
    if (normalizedText.includes(term) && !normalizedSources.includes(term)) {
      problems.push(`termo não sustentado pelos dados: "${term}"`);
    }
  }

  return { ok: problems.length === 0, problems };
}
