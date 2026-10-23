import type { PublicHighlight, PublicIndicator, PublicProjectStage } from "@/lib/results/public";
import { PUBLIC_STAGE_LABELS } from "@/lib/results/public";
import { cn } from "cn";

/** Barra de proporção de um percentual; o valor sempre aparece também em texto. */
export function ProportionBar({ percentage }: { percentage: number }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted" aria-hidden>
      <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, Math.max(0, percentage))}%` }} />
    </div>
  );
}

export function HighlightTile({ highlight, compact = false }: { highlight: PublicHighlight; compact?: boolean }) {
  return (
    <div className={cn("flex flex-col gap-2 rounded-xl border bg-card", compact ? "p-4" : "p-5")}>
      <p className={cn("font-semibold tracking-tight tabular-nums", compact ? "text-2xl" : "text-3xl")}>
        {highlight.value}
      </p>
      {highlight.percentage !== null && <ProportionBar percentage={highlight.percentage} />}
      <p className={cn("leading-snug", compact ? "text-xs" : "text-sm")}>{highlight.label}</p>
      {highlight.detail && <p className="text-xs text-muted-foreground">{highlight.detail}</p>}
    </div>
  );
}

export function IndicatorResult({ indicator }: { indicator: PublicIndicator }) {
  return (
    <div className="space-y-1.5">
      <dt className="text-xs font-medium text-muted-foreground">{indicator.name}</dt>
      <dd className="text-sm font-medium tabular-nums">{indicator.summary}</dd>
      {indicator.percentage !== null && <ProportionBar percentage={indicator.percentage} />}
    </div>
  );
}

const STAGE_STYLES: Record<PublicProjectStage, string> = {
  PLANNING: "bg-secondary text-secondary-foreground",
  RECORDING: "bg-warning-soft text-warning",
  COMPLETED: "bg-success-soft text-success",
};

export function StageBadge({ stage }: { stage: PublicProjectStage }) {
  return (
    <span className={cn("inline-flex rounded-full px-2.5 py-1 text-xs font-medium", STAGE_STYLES[stage])}>
      {PUBLIC_STAGE_LABELS[stage]}
    </span>
  );
}

export function formatDatePt(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}
