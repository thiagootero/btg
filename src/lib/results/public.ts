/**
 * Visão pública dos resultados (funções puras): a vitrine da organização, com
 * todos os projetos, e o detalhe de cada projeto.
 *
 * Protótipo: todos os projetos ficam abertos por link, inclusive com resultados
 * ainda em registro. Entram os dados alcançados já registrados e o texto técnico
 * APROVADO; propostas da IA, rascunhos de texto, percepção da equipe, contexto
 * interno e meios de verificação nunca saem daqui.
 */
import { formatNumberPt, formatPercentage } from "@/lib/results/indicator";
import { RESULT_SOURCE_TYPES, type ResultSourceType } from "@/lib/results/items";
import { isApproved, type FinalEvaluationStatus } from "@/lib/results/status";
import type { ResultCardView } from "@/lib/results/view";

export interface PublicIndicator {
  name: string;
  /** Resumo do dado (ex.: "80% do total avaliado (80 de 100 crianças)"). */
  summary: string;
  /** Percentual calculado pelo sistema (barra de proporção), quando houver. */
  percentage: number | null;
}

export interface PublicItem {
  id: string;
  label: string;
  item: string;
  target: string | null;
  indicators: PublicIndicator[];
  /** Texto técnico aprovado; null enquanto está em elaboração. */
  text: string | null;
}

export interface PublicSection {
  type: ResultSourceType;
  title: string;
  items: PublicItem[];
}

/** Número em destaque. */
export interface PublicHighlight {
  /** "80%" ou "1.200". */
  value: string;
  /** O que o número mede (nome do indicador). */
  label: string;
  /** Complemento (ex.: "80 de 100 crianças"); null quando o valor já diz tudo. */
  detail: string | null;
  percentage: number | null;
}

/**
 * Em que ponto o projeto está: Jornada ainda em construção, resultados em
 * registro ou registro finalizado.
 */
export type PublicProjectStage = "PLANNING" | "RECORDING" | "COMPLETED";

export const PUBLIC_STAGE_LABELS: Record<PublicProjectStage, string> = {
  PLANNING: "Em planejamento",
  RECORDING: "Resultados em registro",
  COMPLETED: "Resultados finalizados",
};

export interface PublicProjectInfo {
  id: string;
  name: string;
  areaLabel: string;
  territory: string;
  targetAudience: string;
  duration: string;
  problem: string;
  impact: string | null;
}

export interface PublicResultsView {
  organization: { id: string; name: string };
  project: PublicProjectInfo;
  stage: PublicProjectStage;
  completedAt: string | null;
  highlights: PublicHighlight[];
  sections: PublicSection[];
}

export interface PublicOrganizationView {
  organization: { id: string; name: string };
  projects: Array<{
    project: PublicProjectInfo;
    stage: PublicProjectStage;
    /** Até 3 números em destaque do projeto. */
    highlights: PublicHighlight[];
    /** Itens com resultado registrado. */
    itemsWithResults: number;
  }>;
}

const MAX_HIGHLIGHTS = 4;
const MAX_ORGANIZATION_HIGHLIGHTS = 3;

/** Títulos para quem lê de fora (sem o vocabulário das etapas da Jornada). */
export const PUBLIC_SECTION_TITLES: Record<ResultSourceType, string> = {
  ACTIVITY: "O que foi realizado",
  OUTCOME: "Mudanças observadas no público",
  IMPACT: "Impacto de longo prazo",
};

function highlightOf(card: ResultCardView, index: number): PublicHighlight | null {
  const data = card.data.indicators[index];
  const view = card.indicators[index];
  if (!view.achievedSummary) return null;
  const unit = data.unit?.trim();
  if (data.kind === "PERCENTAGE" && view.percentage !== null) {
    return {
      value: formatPercentage(view.percentage),
      label: view.name,
      detail: `${formatNumberPt(data.numerator!)} de ${formatNumberPt(data.denominator!)}${unit ? ` ${unit}` : ""}`,
      percentage: view.percentage,
    };
  }
  if (data.kind === "COUNT" && data.achievedValue !== null) {
    return { value: formatNumberPt(data.achievedValue), label: view.name, detail: unit || null, percentage: null };
  }
  return null;
}

/** Entra na página o item com algum dado registrado ou com texto aprovado. */
const hasPublicContent = (c: ResultCardView) => c.filledCount > 0 || (isApproved(c) && Boolean(c.approvedText));

/**
 * Monta o detalhe público de um projeto. Os destaques vêm primeiro dos
 * resultados de médio prazo (a mudança no público) e depois das atividades
 * (a entrega), até {@link MAX_HIGHLIGHTS}.
 */
export function buildPublicResults(input: {
  organization: PublicResultsView["organization"];
  project: PublicProjectInfo;
  /** null: a Jornada ainda não foi concluída. */
  evaluationStatus: FinalEvaluationStatus | null;
  journeyConcluded: boolean;
  completedAt: string | null;
  cards: ResultCardView[];
}): PublicResultsView {
  const visible = input.cards.filter(hasPublicContent);

  const sections: PublicSection[] = RESULT_SOURCE_TYPES.map((type) => ({
    type,
    title: PUBLIC_SECTION_TITLES[type],
    items: visible
      .filter((c) => c.sourceType === type)
      .map((c) => ({
        id: c.recordId,
        label: c.label,
        item: c.reference.item,
        target: c.reference.target,
        indicators: c.indicators
          .filter((i) => i.achievedSummary)
          .map((i) => ({ name: i.name, summary: i.achievedSummary!, percentage: i.percentage })),
        text: isApproved(c) && c.approvedText ? c.approvedText : null,
      })),
  })).filter((s) => s.items.length > 0);

  const highlights: PublicHighlight[] = [];
  for (const type of ["OUTCOME", "ACTIVITY"] as const) {
    for (const card of visible.filter((c) => c.sourceType === type)) {
      card.indicators.forEach((_, i) => {
        const h = highlightOf(card, i);
        if (h && highlights.length < MAX_HIGHLIGHTS) highlights.push(h);
      });
    }
  }

  const stage: PublicProjectStage = !input.journeyConcluded
    ? "PLANNING"
    : input.evaluationStatus === "COMPLETED"
      ? "COMPLETED"
      : "RECORDING";

  return {
    organization: input.organization,
    project: input.project,
    stage,
    completedAt: stage === "COMPLETED" ? input.completedAt : null,
    highlights,
    sections,
  };
}

/**
 * Vitrine da organização: projetos com resultado registrado primeiro (os
 * finalizados à frente), depois os demais, cada grupo por nome.
 */
export function buildPublicOrganization(
  organization: PublicOrganizationView["organization"],
  projects: PublicResultsView[],
): PublicOrganizationView {
  const rank = (p: PublicResultsView) => (p.stage === "COMPLETED" ? 0 : p.sections.length > 0 ? 1 : 2);
  return {
    organization,
    projects: [...projects]
      .sort((a, b) => rank(a) - rank(b) || a.project.name.localeCompare(b.project.name, "pt-BR"))
      .map((p) => ({
        project: p.project,
        stage: p.stage,
        highlights: p.highlights.slice(0, MAX_ORGANIZATION_HIGHLIGHTS),
        itemsWithResults: p.sections.reduce((n, s) => n + s.items.length, 0),
      })),
  };
}

/** Vitrine pública da organização ou, com o projeto, o detalhe dele. */
export function publicPath(organizationId: string, projectId?: string): string {
  return projectId ? `/publico/${organizationId}/${projectId}` : `/publico/${organizationId}`;
}

/** Ids aceitos nas rotas públicas (evita consultas com valores arbitrários). */
export const PUBLIC_ID_PATTERN = /^[A-Za-z0-9_-]{8,40}$/;
