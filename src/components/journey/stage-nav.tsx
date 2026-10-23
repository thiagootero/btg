"use client";

import { Check, ClipboardList } from "lucide-react";
import type { JourneyController } from "@/components/journey/use-journey";
import {
  STAGE_SHORT_LABELS,
  VISIBLE_STAGES,
  stageNumber,
  stageStates,
  summaryReady,
  type JourneyStep,
  type StageState,
} from "@/lib/journey/stages";
import { cn } from "@/lib/utils";

const STATE_LABEL: Record<StageState, string> = {
  approved: "Concluída",
  current: "Em andamento",
  pending: "Pendente",
};

/**
 * Passo a passo horizontal da jornada: as etapas em sequência, com as
 * concluídas, a atual e as pendentes, e por fim o resumo. Cada passo exibe seu
 * conteúdo no centro.
 */
export function JourneyStepper({
  journey,
  selectedStep,
  onSelectStep,
}: {
  journey: JourneyController;
  selectedStep: JourneyStep;
  onSelectStep: (step: JourneyStep) => void;
}) {
  const { snapshot } = journey.view;
  const states = stageStates(snapshot.approvedStages);
  const ready = summaryReady(snapshot.approvedStages);
  const steps: Array<{ step: JourneyStep; label: string; state: StageState }> = [
    ...VISIBLE_STAGES.map((stage) => ({
      step: stage as JourneyStep,
      label: STAGE_SHORT_LABELS[stage],
      state: states[stage],
    })),
    { step: "SUMMARY", label: "Resumo", state: ready ? "approved" : "pending" },
  ];
  const current = steps.find((s) => s.state === "current");

  return (
    <nav aria-label="Etapas da jornada" className="border-b bg-card px-4 py-4 sm:px-6">
      <p className="sr-only">
        {ready
          ? "Todas as etapas concluídas. O resumo está disponível."
          : current
            ? `Etapa ${steps.indexOf(current) + 1} de ${VISIBLE_STAGES.length} em andamento.`
            : ""}
      </p>
      <ol className="mx-auto flex max-w-5xl items-start">
        {steps.map(({ step, label, state }, index) => {
          const isLast = index === steps.length - 1;
          const isSummary = step === "SUMMARY";
          return (
            <li key={step} className="relative flex flex-1 flex-col items-center">
              {/* Linha de ligação até o próximo passo */}
              {!isLast && (
                <span
                  aria-hidden
                  className={cn(
                    "absolute left-1/2 top-4 h-0.5 w-full -translate-y-1/2",
                    state === "approved" ? "bg-success" : "bg-border",
                  )}
                />
              )}
              <button
                type="button"
                onClick={() => onSelectStep(step)}
                aria-current={state === "current" ? "step" : undefined}
                aria-pressed={step === selectedStep}
                aria-label={
                  isSummary
                    ? `Resumo — ${ready ? "Disponível" : "Disponível ao concluir o impacto"}`
                    : `Etapa ${stageNumber(step)}: ${label} — ${STATE_LABEL[state]}`
                }
                className={cn(
                  "group relative z-10 flex flex-col items-center gap-1.5 rounded-lg px-2 pb-1 outline-none",
                  step === selectedStep && "bg-accent",
                )}
              >
                <span
                  className={cn(
                    "flex size-8 items-center justify-center rounded-full border-2 text-sm font-semibold transition",
                    "group-hover:scale-105 group-focus-visible:ring-3 group-focus-visible:ring-ring/50",
                    state === "approved" && "border-success bg-success text-white",
                    state === "current" && "border-primary bg-primary text-primary-foreground ring-4 ring-primary/15",
                    state === "pending" && "border-border bg-background text-muted-foreground",
                  )}
                >
                  {isSummary ? (
                    <ClipboardList className="size-4" aria-hidden />
                  ) : state === "approved" ? (
                    <Check className="size-4" aria-hidden />
                  ) : (
                    stageNumber(step)
                  )}
                </span>
                <span
                  className={cn(
                    "max-w-[7.5rem] text-center text-xs leading-tight",
                    state === "current" || (isSummary && ready)
                      ? "font-semibold text-foreground"
                      : "text-muted-foreground",
                    // No celular, só a etapa atual mostra o nome.
                    state !== "current" && "hidden sm:block",
                  )}
                >
                  {label}
                </span>
                <span
                  className={cn(
                    "hidden text-[11px] sm:block",
                    state === "approved" && "text-success",
                    state === "current" && "text-primary",
                    state === "pending" && "text-muted-foreground/80",
                  )}
                >
                  {isSummary ? (ready ? "Disponível" : "Ao concluir") : STATE_LABEL[state]}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
