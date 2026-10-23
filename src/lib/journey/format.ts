import { TO_DEFINE, isToDefine } from "@/lib/journey/rules";
import type { ActivityView, OutcomeView, TerritoryView } from "@/lib/journey/types";

export function orDefine(value: string | null | undefined): string {
  return isToDefine(value) ? TO_DEFINE : (value as string).trim();
}

export function twoDigits(n: number): string {
  return String(n).padStart(2, "0");
}

/** "a, b e c" */
export function joinPt(items: string[]): string {
  const list = items.filter(Boolean);
  if (list.length <= 1) return list.join("");
  return `${list.slice(0, -1).join(", ")} e ${list[list.length - 1]}`;
}

export function formatTerritories(territories: TerritoryView[]): string {
  const byState = new Map<string, string[]>();
  for (const t of territories) {
    byState.set(t.state, [...(byState.get(t.state) ?? []), t.city]);
  }
  return [...byState.entries()].map(([uf, cities]) => `${joinPt(cities)} (${uf})`).join("; ");
}

export function formatDuration(months: number): string {
  return months === 1 ? "1 mês" : `${months} meses`;
}

export function stripTrailingPeriod(text: string): string {
  return text.trim().replace(/[.;\s]+$/, "");
}

export function lowerFirst(text: string): string {
  return text ? text.charAt(0).toLowerCase() + text.slice(1) : text;
}

export function upperFirst(text: string): string {
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}

export function ensurePeriod(text: string): string {
  const t = text.trim();
  return /[.!?]$/.test(t) ? t : `${t}.`;
}

export function activityTargetText(a: Pick<ActivityView, "target">): string {
  if (!a.target) return TO_DEFINE;
  const deadline = a.target.deadline && !isToDefine(a.target.deadline) ? a.target.deadline : null;
  const base = stripTrailingPeriod(a.target.description);
  return deadline && !base.toLowerCase().includes(deadline.toLowerCase()) ? `${base} (prazo: ${deadline})` : base;
}

/** Duração da atividade para exibição: "10 meses", "1 mês" ou "a definir". */
export function durationText(months: number | null | undefined): string {
  if (months === null || months === undefined) return TO_DEFINE;
  return months === 1 ? "1 mês" : `${months} meses`;
}

/** Linhas no formato aprovado de atividade. */
export function activityLines(a: ActivityView): Array<[string, string]> {
  return [
    ["Atividade", upperFirst(stripTrailingPeriod(a.description))],
    ["Meta", activityTargetText(a)],
    ["Indicadores", a.indicators.length ? a.indicators.map((i) => i.name).join("; ") : TO_DEFINE],
    ["Meio de verificação", a.evidences.length ? a.evidences.join("; ") : TO_DEFINE],
  ];
}

/** Linhas no formato aprovado de resultado. */
export function outcomeLines(o: OutcomeView): Array<[string, string]> {
  return [
    ["Resultado", upperFirst(stripTrailingPeriod(o.description))],
    ["Meta", orDefine(o.target)],
    ["Indicador", o.indicators.length ? o.indicators.map((i) => i.name).join("; ") : TO_DEFINE],
    ["Meio de verificação", o.evidences.length ? o.evidences.join("; ") : TO_DEFINE],
  ];
}

export function linesToText(lines: Array<[string, string]>): string {
  return lines.map(([k, v]) => `${k}: ${v}`).join("\n");
}

/**
 * Texto da estratégia para o relatório, construído a partir das atividades
 * aprovadas: conecta as ações à forma de enfrentar a situação. Projetos antigos
 * que tenham estratégia registrada a usam como abertura. Só compõe a frase
 * quando todas as atividades começam por verbo no infinitivo, para manter o
 * texto gramaticalmente coerente. Retorna null quando não há o que mostrar.
 */
export function reportStrategyText(
  strategy: string | null,
  activities: Pick<ActivityView, "description">[],
): string | null {
  const base = strategy?.trim() ? ensurePeriod(upperFirst(strategy.trim().replace(/\s+/g, " "))) : null;
  const actions = activities.map((a) => lowerFirst(stripTrailingPeriod(a.description)));
  const allInfinitive =
    actions.length > 0 &&
    actions.every((a) => /^[a-zà-ú]+(ar|er|ir|or)\b/.test(a.split(" ")[0] ?? ""));
  if (!allInfinitive) return base;
  return base
    ? `${base} Na prática, a equipe vai ${joinPt(actions)}.`
    : `Para enfrentar essa situação, a equipe vai ${joinPt(actions)}.`;
}
