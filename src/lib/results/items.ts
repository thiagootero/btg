/**
 * Itens previstos na Jornada que recebem registro de resultado (funções puras):
 * atividades (Etapa 2), resultados de médio prazo (Etapa 3) e impacto de longo
 * prazo (Etapa 4 — cada mudança/avaliação acompanhada ou, sem elas, o próprio impacto).
 */
import { activityTargetText, stripTrailingPeriod, twoDigits, upperFirst } from "@/lib/journey/format";
import { STAGE_LABELS } from "@/lib/journey/stages";
import type { JourneySnapshot } from "@/lib/journey/types";

export const RESULT_SOURCE_TYPES = ["ACTIVITY", "OUTCOME", "IMPACT"] as const;
export type ResultSourceType = (typeof RESULT_SOURCE_TYPES)[number];

export const RESULT_SECTIONS: Record<ResultSourceType, { number: number; title: string; itemLabel: string }> = {
  ACTIVITY: { number: 2, title: STAGE_LABELS.ACTIVITIES, itemLabel: "Atividade" },
  OUTCOME: { number: 3, title: STAGE_LABELS.OUTCOMES, itemLabel: "Resultado" },
  IMPACT: { number: 4, title: STAGE_LABELS.IMPACT, itemLabel: "Impacto" },
};

export function itemLabel(sourceType: ResultSourceType, number: number): string {
  return `${RESULT_SECTIONS[sourceType].itemLabel} ${twoDigits(number)}`;
}

/** Referência aprovada na Jornada (somente consulta). */
export interface ItemReference {
  item: string;
  target: string | null;
  /** Indicadores aprovados, na ordem da Jornada (cada um recebe o seu dado alcançado). */
  indicators: string[];
  /** A Jornada atual não registra linha de base; exibida só quando houver. */
  baseline: string | null;
  verification: string | null;
  /** Impacto: período de acompanhamento após o fim do projeto. */
  period: string | null;
}

export interface PlannedItem {
  sourceType: ResultSourceType;
  sourceId: string;
  order: number;
  reference: ItemReference;
}

const clean = (v: string | null | undefined) => (v && v.trim() ? v.trim() : null);
const join = (list: string[]) =>
  clean(
    list
      .map((x) => x.trim())
      .filter(Boolean)
      .join("; "),
  );
const names = (list: Array<{ name: string }>) => list.map((x) => x.name.trim()).filter(Boolean);
const sentence = (text: string) => upperFirst(stripTrailingPeriod(text));

export function plannedItems(snapshot: Pick<JourneySnapshot, "activities" | "outcomes" | "impact">): PlannedItem[] {
  const items: PlannedItem[] = [];
  snapshot.activities.forEach((a, i) =>
    items.push({
      sourceType: "ACTIVITY",
      sourceId: a.id,
      order: i,
      reference: {
        item: sentence(a.description),
        target: a.target ? activityTargetText(a) : null,
        indicators: names(a.indicators),
        baseline: null,
        verification: join(a.evidences),
        period: null,
      },
    }),
  );
  snapshot.outcomes.forEach((o, i) =>
    items.push({
      sourceType: "OUTCOME",
      sourceId: o.id,
      order: i,
      reference: {
        item: sentence(o.description),
        target: clean(o.target),
        indicators: names(o.indicators),
        baseline: null,
        verification: join(o.evidences),
        period: null,
      },
    }),
  );
  const impact = snapshot.impact;
  if (impact) {
    if (impact.followUps.length === 0) {
      items.push({
        sourceType: "IMPACT",
        sourceId: impact.id,
        order: 0,
        reference: {
          item: sentence(impact.statement),
          target: null,
          indicators: [],
          baseline: null,
          verification: null,
          period: null,
        },
      });
    }
    impact.followUps.forEach((f, i) =>
      items.push({
        sourceType: "IMPACT",
        sourceId: f.id,
        order: i,
        reference: {
          item: sentence(f.description),
          target: clean(f.target),
          indicators: f.indicator?.trim() ? [f.indicator.trim()] : [],
          baseline: null,
          verification: clean(f.verification),
          period: clean(f.periodAfterEnd),
        },
      }),
    );
  }
  return items;
}

/** Rótulo do dado de um item sem indicador aprovado. */
export const NO_INDICATOR_LABEL = "Resultado alcançado";

/** Indicadores que recebem dado: os aprovados ou, sem nenhum, um dado único (null). */
export function indicatorSlots(ref: Pick<ItemReference, "indicators">): Array<string | null> {
  return ref.indicators.length > 0 ? ref.indicators : [null];
}

export const itemKey = (sourceType: ResultSourceType, sourceId: string) => `${sourceType}:${sourceId}`;
