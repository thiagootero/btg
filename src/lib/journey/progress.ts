import { activityTargetText, orDefine, stripTrailingPeriod, twoDigits } from "@/lib/journey/format";
import { isToDefine, TO_DEFINE } from "@/lib/journey/rules";
import { previousStages, STAGE_LABELS, type JourneyStageKey } from "@/lib/journey/stages";
import type {
  ActivityView,
  EvidencePlanItemView,
  JourneySnapshot,
  OutcomeView,
} from "@/lib/journey/types";

export function isActivityComplete(a: ActivityView): boolean {
  return Boolean(a.target) && a.indicators.length > 0 && a.evidences.length > 0;
}

/** Próximo passo de um resultado aprovado: meta, depois indicador/verificação. */
export function outcomeNextStep(o: OutcomeView): "TARGET" | "INDICATOR" | null {
  if (isToDefine(o.target)) return "TARGET";
  if (o.indicators.length === 0 || o.evidences.length === 0) return "INDICATOR";
  return null;
}

/** Pendências que impedem a aprovação de uma etapa (vazio = pode aprovar). */
export function stageApprovalBlockers(snapshot: JourneySnapshot, stage: JourneyStageKey): string[] {
  const approved = new Set(snapshot.approvedStages);
  const blockers: string[] = [];

  for (const prev of previousStages(stage)) {
    if (!approved.has(prev)) blockers.push(`Aprove antes a etapa “${STAGE_LABELS[prev]}”.`);
  }

  switch (stage) {
    case "CONTEXT":
      break;
    case "ACTIVITIES":
      if (snapshot.activities.length === 0) blockers.push("Aprove pelo menos uma atividade.");
      snapshot.activities.forEach((a, i) => {
        if (!isActivityComplete(a)) {
          blockers.push(`A Atividade ${twoDigits(i + 1)} precisa de meta, indicador e meio de verificação.`);
        }
      });
      break;
    case "OUTCOMES":
      if (snapshot.outcomes.length === 0) blockers.push("Aprove pelo menos uma mudança esperada.");
      snapshot.outcomes.forEach((o, i) => {
        const step = outcomeNextStep(o);
        if (step === "TARGET") blockers.push(`Defina a meta do Resultado ${twoDigits(i + 1)}.`);
        if (step === "INDICATOR") blockers.push(`Defina indicador e verificação do Resultado ${twoDigits(i + 1)}.`);
      });
      break;
    case "IMPACT":
      if (!snapshot.impact) {
        blockers.push("Formule e aprove o impacto de longo prazo.");
      } else if (!snapshot.impact.followUpOption) {
        blockers.push("Escolha como o impacto de longo prazo será acompanhado.");
      } else if (snapshot.impact.followUpOption !== "VISION_ONLY" && snapshot.impact.followUps.length === 0) {
        blockers.push("Inclua pelo menos uma mudança ou avaliação a acompanhar após o projeto.");
      }
      break;
    case "EVIDENCE_PLAN":
      if (snapshot.evidencePlan.length === 0) blockers.push("Consolide e aprove o plano de evidências.");
      break;
  }
  return blockers;
}

// ---------------------------------------------------------------------------
// Consolidação do plano de evidências
// ---------------------------------------------------------------------------

export type ConsolidatedPlanItem = Omit<EvidencePlanItemView, "id">;

function pendingFor(parts: Array<[boolean, string]>): string | null {
  const list = parts.filter(([cond]) => cond).map(([, text]) => text);
  return list.length ? list.join("; ") : null;
}

/**
 * Consolida, a partir do que foi aprovado, as linhas do plano de evidências.
 * Meta, indicador e verificação nunca são inventados aqui: vêm das etapas
 * anteriores. Os campos operacionais recebem apenas sugestões editáveis;
 * o responsável fica sempre "a definir".
 */
export function consolidateEvidencePlan(snapshot: JourneySnapshot): ConsolidatedPlanItem[] {
  const items: ConsolidatedPlanItem[] = [];

  snapshot.activities.forEach((a, i) => {
    items.push({
      order: items.length,
      sourceType: "ACTIVITY",
      sourceId: a.id,
      sourceLabel: `Atividade ${twoDigits(i + 1)} — ${stripTrailingPeriod(a.description)}`,
      target: a.target ? activityTargetText(a) : null,
      indicator: a.indicators.map((x) => x.name).join("; ") || null,
      verification: a.evidences.join("; ") || null,
      collectionTiming: "Durante a execução, a cada atividade realizada",
      responsible: null,
      instrument: "Planilha de registro da execução das atividades",
      pending: pendingFor([
        [true, "Definir quem registrará"],
        [!a.target?.deadline, "Prazo da meta a definir"],
        [a.target?.durationMonths == null, "Duração da atividade a definir"],
      ]),
    });
  });

  snapshot.outcomes.forEach((o, i) => {
    items.push({
      order: items.length,
      sourceType: "OUTCOME",
      sourceId: o.id,
      sourceLabel: `Resultado ${twoDigits(i + 1)} — ${stripTrailingPeriod(o.description)}`,
      target: isToDefine(o.target) ? null : o.target,
      indicator: o.indicators.map((x) => x.name).join("; ") || null,
      verification: o.evidences.join("; ") || null,
      collectionTiming: "Ao final do projeto",
      responsible: null,
      instrument: "Ficha de acompanhamento do público (a construir)",
      pending: pendingFor([
        [true, "Definir quem registrará"],
        [true, "Construir o instrumento de coleta"],
      ]),
    });
  });

  const impact = snapshot.impact;
  if (impact && impact.followUpOption && impact.followUpOption !== "VISION_ONLY") {
    impact.followUps.forEach((f, i) => {
      items.push({
        order: items.length,
        sourceType: "IMPACT",
        sourceId: f.id,
        sourceLabel: `Impacto — ${
          impact.followUpOption === "FUTURE_EVALUATION" ? "avaliação futura" : "acompanhamento"
        } ${twoDigits(i + 1)}: ${stripTrailingPeriod(f.description)}`,
        target: f.target,
        indicator: f.indicator,
        verification: f.verification,
        collectionTiming: f.periodAfterEnd ? `${f.periodAfterEnd}` : null,
        responsible: null,
        instrument: null,
        pending: pendingFor([
          [true, "Definir quem registrará"],
          [!f.periodAfterEnd, "Período após o encerramento a definir"],
          [!f.target, "Meta a definir"],
          [impact.followUpOption === "FUTURE_EVALUATION", "Confirmar equipe e recursos para a avaliação"],
        ]),
      });
    });
  }

  return items;
}

export function displayOrDefine(value: string | null | undefined): string {
  return value && !isToDefine(value) ? value : TO_DEFINE;
}

export { orDefine };
