/**
 * APENAS SIMULAÇÃO, sem IA: monta o texto técnico com um modelo fixo a partir
 * dos dados informados. Usado com AI_PROVIDER=mock (padrão) e nos testes.
 */
import { ensurePeriod, lowerFirst, stripTrailingPeriod } from "@/lib/journey/format";
import { formatNumberPt, formatPercentage } from "@/lib/results/indicator";
import { defaultFormSpec } from "@/lib/results/form-spec";
import type {
  ResultFormRequest,
  ResultIndicatorFigures,
  ResultFormResponse,
  ResultTextProvider,
  ResultTextRequest,
  ResultTextResponse,
} from "@/lib/results-ai/types";

function recordedSentence(r: ResultIndicatorFigures): string {
  const unit = r.unit?.trim();
  const indicator = r.indicator ? ` no indicador “${stripTrailingPeriod(r.indicator)}”` : "";
  switch (r.kind) {
    case "PERCENTAGE":
      return `Ao final do projeto, a avaliação registrou ${formatNumberPt(r.numerator ?? 0)} de ${formatNumberPt(r.denominator ?? 0)}${unit ? ` ${unit}` : ""} com a mudança esperada${indicator}, o que corresponde a ${formatPercentage(r.percentage ?? 0)} do total avaliado.`;
    case "COUNT":
      return `Ao final do projeto, o valor registrado${indicator} foi de ${formatNumberPt(r.achievedValue ?? 0)}${unit ? ` ${unit}` : ""}.`;
    case "TEXT":
      return `Ao final do projeto, a organização registrou o seguinte resultado${indicator}: ${ensurePeriod(lowerFirst(stripTrailingPeriod(r.achievedText ?? "")))}`;
  }
}

export class MockResultTextProvider implements ResultTextProvider {
  readonly name = "mock";
  readonly isMock = true;

  async organize(request: ResultTextRequest): Promise<ResultTextResponse> {
    const parts = request.indicators.map(recordedSentence);
    if (request.teamPerception?.trim()) {
      parts.push(`Na percepção da equipe, ${ensurePeriod(lowerFirst(stripTrailingPeriod(request.teamPerception)))}`);
    }
    if (request.additionalContext?.trim()) {
      parts.push(
        `Como contexto, a organização registra que ${ensurePeriod(lowerFirst(stripTrailingPeriod(request.additionalContext)))}`,
      );
    }
    return { text: parts.join(" ") };
  }

  /** Simulação: o formulário padrão de cada item. */
  async generateForms(request: ResultFormRequest): Promise<ResultFormResponse> {
    return {
      forms: Object.fromEntries(
        request.items.map((i) => [
          i.id,
          defaultFormSpec(i.sourceType, {
            item: i.item,
            target: i.target,
            indicators: i.indicators,
            baseline: null,
            verification: null,
            period: i.period,
          }),
        ]),
      ),
    };
  }
}
