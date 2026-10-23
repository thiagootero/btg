/**
 * Visão serializável da área de Resultados (funções puras). Os cards sempre
 * mostram o snapshot gravado no registro — nunca a versão atual da Jornada.
 */
import { achievedSummary, computePercentage, figuresComplete, type ResultIndicatorKind } from "@/lib/results/indicator";
import { resolveFormSpec, type IndicatorFormSpec, type ResultFormSpec } from "@/lib/results/form-spec";
import { itemLabel, NO_INDICATOR_LABEL, type ItemReference, type ResultSourceType } from "@/lib/results/items";
import { allIndicatorsComplete, type IndicatorData, type ResultData } from "@/lib/results/schemas";
import { allApproved, type FinalEvaluationStatus, type OutcomeResultStatus } from "@/lib/results/status";

export type { ItemReference };

/** Dado de um indicador como sai do banco, com decimais já convertidos em número. */
export interface ResultIndicatorRow {
  id: string;
  order: number;
  /** null: item sem indicador aprovado (dado único). */
  name: string | null;
  kind: ResultIndicatorKind | null;
  denominator: number | null;
  numerator: number | null;
  achievedValue: number | null;
  unit: string | null;
  achievedText: string | null;
}

/** Registro como sai do banco, com os indicadores em ordem. */
export interface ResultRecordRow {
  id: string;
  sourceType: ResultSourceType;
  sourceId: string;
  order: number;
  itemSnapshot: string;
  targetSnapshot: string | null;
  baselineSnapshot: string | null;
  verificationSnapshot: string | null;
  periodSnapshot: string | null;
  formSpec: unknown;
  indicators: ResultIndicatorRow[];
  teamPerception: string | null;
  additionalContext: string | null;
  proposedText: string | null;
  proposalIsMock: boolean;
  approvedText: string | null;
  approvedAt: string | null;
  status: OutcomeResultStatus;
}

export interface IndicatorCardView {
  /** Id do registro do indicador (enviado de volta ao salvar). */
  id: string;
  /** Nome do indicador (ou "Resultado alcançado" quando o item não tem indicador). */
  name: string;
  form: IndicatorFormSpec;
  percentage: number | null;
  achievedSummary: string | null;
}

export interface ResultCardView {
  recordId: string;
  sourceType: ResultSourceType;
  /** Ex.: "Atividade 02", "Resultado 01". */
  label: string;
  reference: ItemReference;
  /** O item foi alterado na Jornada depois do início da avaliação. */
  journeyChanged: boolean;
  /** O item foi excluído da Jornada depois do início da avaliação. */
  itemRemoved: boolean;
  /** Perguntas do formulário (personalizadas pela IA ou padrão). */
  form: ResultFormSpec;
  data: ResultData;
  /** Um bloco por indicador, na ordem de data.indicators. */
  indicators: IndicatorCardView[];
  /** Quantos indicadores já têm o dado alcançado completo. */
  filledCount: number;
  /** Todos os indicadores preenchidos (pode organizar/aprovar o texto). */
  complete: boolean;
  status: OutcomeResultStatus;
  proposedText: string | null;
  proposalIsMock: boolean;
  approvedText: string | null;
  approvedAt: string | null;
}

export function indicatorData(i: ResultIndicatorRow): IndicatorData {
  return {
    id: i.id,
    kind: i.kind,
    denominator: i.denominator,
    numerator: i.numerator,
    achievedValue: i.achievedValue,
    unit: i.unit,
    achievedText: i.achievedText,
  };
}

export function recordData(row: ResultRecordRow): ResultData {
  return {
    indicators: row.indicators.map(indicatorData),
    teamPerception: row.teamPerception,
    additionalContext: row.additionalContext,
  };
}

export function recordReference(row: ResultRecordRow): ItemReference {
  return {
    item: row.itemSnapshot,
    target: row.targetSnapshot,
    indicators: row.indicators.map((i) => i.name).filter((n): n is string => Boolean(n)),
    baseline: row.baselineSnapshot,
    verification: row.verificationSnapshot,
    period: row.periodSnapshot,
  };
}

/**
 * @param number posição do item na sua seção (1, 2, 3…)
 * @param live referência atual do item na Jornada (null se foi excluído)
 */
export function buildResultCard(row: ResultRecordRow, number: number, live: ItemReference | null): ResultCardView {
  const reference = recordReference(row);
  const data = recordData(row);
  const form = resolveFormSpec(row.formSpec, row.sourceType, reference);
  return {
    recordId: row.id,
    sourceType: row.sourceType,
    label: itemLabel(row.sourceType, number),
    reference,
    journeyChanged: Boolean(
      live &&
      (live.item !== reference.item ||
        live.target !== reference.target ||
        live.indicators.join("\n") !== reference.indicators.join("\n")),
    ),
    itemRemoved: live === null,
    form,
    data,
    indicators: row.indicators.map((i, index) => ({
      id: i.id,
      name: i.name ?? NO_INDICATOR_LABEL,
      form: form.indicators[index],
      percentage: i.kind === "PERCENTAGE" ? computePercentage(i.numerator, i.denominator) : null,
      achievedSummary: achievedSummary(i),
    })),
    filledCount: data.indicators.filter(figuresComplete).length,
    complete: allIndicatorsComplete(data),
    status: row.status,
    proposedText: row.proposedText,
    proposalIsMock: row.proposalIsMock,
    approvedText: row.approvedText,
    approvedAt: row.approvedAt,
  };
}

export interface ResultsViewState {
  project: { id: string; name: string; organizationId: string; organizationName: string; isDemo: boolean };
  canEdit: boolean;
  /** false enquanto a Jornada não estiver aprovada. */
  unlocked: boolean;
  evaluation: {
    status: FinalEvaluationStatus;
    startedAt: string;
    completedAt: string | null;
    /** As perguntas personalizadas já foram geradas. */
    formReady: boolean;
    formSource: string | null;
  } | null;
  /** Atividades, resultados de médio prazo e impacto, nessa ordem. */
  cards: ResultCardView[];
  /** Todos os resultados de médio prazo com texto aprovado: síntese disponível. */
  readyForSynthesis: boolean;
  /** Mensagem amigável quando a IA falhou (nada foi alterado). */
  aiError?: string;
}

/**
 * A síntese exige texto aprovado em todos os resultados de médio prazo.
 * Atividades e impacto são opcionais (o impacto costuma ser medido depois).
 */
export function synthesisReady(cards: Pick<ResultCardView, "sourceType" | "status" | "approvedText">[]): boolean {
  return allApproved(cards.filter((c) => c.sourceType === "OUTCOME"));
}
