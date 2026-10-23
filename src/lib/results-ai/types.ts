import type { JourneyAIUsage } from "@/lib/journey-ai/types";
import type { ResultFormSpec } from "@/lib/results/form-spec";
import type { ResultIndicatorKind } from "@/lib/results/indicator";
import type { ResultSourceType } from "@/lib/results/items";

/**
 * Tudo o que vai à IA para organizar o texto técnico de um resultado — e
 * nada além disso (sem meio de verificação, sem dados pessoais).
 */
export interface ResultTextRequest {
  project: {
    name: string;
    areaLabel: string;
    targetAudience: string;
    problem: string;
    territory: string;
    durationMonths: number;
    /** Estratégia de atuação (opcional na Jornada). */
    strategy: string | null;
  };
  /** Nível na lógica de impacto: atividade, resultado de médio prazo ou impacto. */
  level: string;
  /** Snapshot do item, meta e linha de base aprovados. */
  item: string;
  target: string | null;
  baseline: string | null;
  /** Dado alcançado em cada indicador do item (todos preenchidos). */
  indicators: ResultIndicatorFigures[];
  /** Lógica de impacto aprovada em torno do item: dá sentido ao resultado. */
  logic: ResultLogicContext;
  /** "O que esse resultado mostra na prática?" — percepção da equipe. */
  teamPerception: string | null;
  additionalContext: string | null;
}

export interface ResultLogicContext {
  /** Atividade: resultados de médio prazo que ela sustenta. Resultado: o impacto. */
  contributesTo: string[];
  /** Resultado: atividades que levam a ele. Impacto: os resultados de médio prazo. */
  builtOn: string[];
  /** Mudança de longo prazo buscada pelo projeto. */
  impact: string | null;
}

export interface ResultIndicatorFigures {
  /** Nome do indicador; null quando o item não tem indicador aprovado. */
  indicator: string | null;
  kind: ResultIndicatorKind;
  /** Indicador percentual. */
  denominator: number | null;
  numerator: number | null;
  /** Calculado pelo sistema; a IA nunca o altera. */
  percentage: number | null;
  /** Indicador numérico. */
  achievedValue: number | null;
  unit: string | null;
  /** Indicador textual. */
  achievedText: string | null;
}

export interface ResultTextResponse {
  text: string;
}

/** Pedido único, ao concluir a Jornada, das perguntas personalizadas de cada item. */
export interface ResultFormRequest {
  project: ResultTextRequest["project"];
  items: Array<{
    /** Chave do item (devolvida na resposta). */
    id: string;
    sourceType: ResultSourceType;
    level: string;
    item: string;
    target: string | null;
    /** Indicadores aprovados (vazio: o item recebe um único dado). */
    indicators: string[];
    period: string | null;
  }>;
}

export interface ResultFormResponse {
  /** Formulários válidos por id; itens ausentes usam o formulário padrão. */
  forms: Record<string, ResultFormSpec>;
}

export interface ResultTextProvider {
  readonly name: string;
  readonly isMock: boolean;
  organize(request: ResultTextRequest): Promise<ResultTextResponse>;
  generateForms(request: ResultFormRequest): Promise<ResultFormResponse>;
}

export type ResultTextUsage = JourneyAIUsage;
