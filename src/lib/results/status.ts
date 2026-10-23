/**
 * Regras de status dos resultados registrados (funções puras).
 *
 * - DRAFT: dados em preenchimento, sem texto aprovado vigente.
 * - AI_PROPOSED: há uma proposta de texto da IA aguardando decisão.
 * - APPROVED: a organização aprovou o texto técnico.
 *
 * Nenhum texto é aprovado automaticamente, e qualquer mudança nos dados
 * registrados invalida a proposta e a aprovação anteriores.
 */
import { summaryReady, type JourneyStageKey } from "@/lib/journey/stages";
import type { IndicatorData, ResultData } from "@/lib/results/schemas";

export type OutcomeResultStatus = "DRAFT" | "AI_PROPOSED" | "APPROVED";
export type FinalEvaluationStatus = "DRAFT" | "IN_PROGRESS" | "COMPLETED";

export const RESULTS_LOCKED_MESSAGE =
  "Conclua e aprove a Jornada de Impacto para registrar os resultados alcançados pelo projeto.";

/** A área de Resultados só abre com a Jornada aprovada (contexto, atividades, resultados e impacto). */
export function resultsUnlocked(approvedStages: Iterable<JourneyStageKey>): boolean {
  return summaryReady(approvedStages);
}

export interface RecordTextState {
  status: OutcomeResultStatus;
  proposedText: string | null;
  approvedText: string | null;
}

const FIGURE_FIELDS: Array<keyof IndicatorData> = [
  "id",
  "kind",
  "denominator",
  "numerator",
  "achievedValue",
  "unit",
  "achievedText",
];

export function dataChanged(before: ResultData, after: ResultData): boolean {
  if ((before.teamPerception ?? null) !== (after.teamPerception ?? null)) return true;
  if ((before.additionalContext ?? null) !== (after.additionalContext ?? null)) return true;
  if (before.indicators.length !== after.indicators.length) return true;
  return before.indicators.some((b, i) =>
    FIGURE_FIELDS.some((k) => (b[k] ?? null) !== (after.indicators[i][k] ?? null)),
  );
}

/** Salvar rascunho: se os dados mudaram, proposta e aprovação deixam de valer. */
export function afterSave(state: RecordTextState, changed: boolean): RecordTextState {
  if (!changed) return state;
  return { status: "DRAFT", proposedText: null, approvedText: null };
}

/** Nova proposta da IA: fica pendente; a aprovação anterior só volta se a proposta for descartada. */
export function afterProposal(state: RecordTextState, text: string): RecordTextState {
  return { ...state, status: "AI_PROPOSED", proposedText: text };
}

/** Descartar a proposta: volta ao texto aprovado (se houver) ou ao rascunho. */
export function afterDiscard(state: RecordTextState): RecordTextState {
  return { ...state, status: state.approvedText ? "APPROVED" : "DRAFT", proposedText: null };
}

/** Aprovar um texto (da IA, editado ou escrito pela organização). */
export function afterApprove(text: string): RecordTextState {
  return { status: "APPROVED", proposedText: null, approvedText: text };
}

/** Só conta como aprovado o registro com status APPROVED e texto aprovado. */
export function isApproved(state: Pick<RecordTextState, "status" | "approvedText">): boolean {
  return state.status === "APPROVED" && Boolean(state.approvedText?.trim());
}

/** A síntese (e a finalização) exige todos os resultados com texto aprovado. */
export function allApproved(records: Array<Pick<RecordTextState, "status" | "approvedText">>): boolean {
  return records.length > 0 && records.every(isApproved);
}

/** Status da avaliação a partir dos registros (COMPLETED só por finalização explícita). */
export function evaluationStatusFor(
  current: FinalEvaluationStatus,
  records: Array<Pick<RecordTextState, "status" | "approvedText">>,
): FinalEvaluationStatus {
  if (current === "COMPLETED" && allApproved(records)) return "COMPLETED";
  return records.some(isApproved) ? "IN_PROGRESS" : "DRAFT";
}
