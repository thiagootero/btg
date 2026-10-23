"use client";

import { Ficha } from "@/components/journey/ficha";
import { ValueOrToDefine } from "@/components/journey/to-define";
import { durationText, stripTrailingPeriod, twoDigits } from "@/lib/journey/format";
import {
  activityListPayloadSchema,
  activityPayloadSchema,
  evidencePlanPayloadSchema,
  impactPayloadSchema,
  IMPACT_OPTION_LABELS,
  outcomePayloadSchema,
  type ProposalTypeKey,
} from "@/lib/journey/proposal-schemas";
import type { JourneySnapshot } from "@/lib/journey/types";

export const PROPOSAL_TITLES: Record<ProposalTypeKey, string> = {
  ACTIVITY: "Ficha da atividade",
  OUTCOME: "Resultados de Médio Prazo",
  IMPACT: "Impacto de longo prazo",
  EVIDENCE_PLAN: "Plano de evidências",
};


export function proposalTitle(type: ProposalTypeKey, payload: unknown): string {
  if (type === "ACTIVITY" && activityListPayloadSchema.safeParse(payload).success) return "Lista de atividades";
  if (type === "OUTCOME") {
    const p = outcomePayloadSchema.safeParse(payload);
    if (p.success && p.data.step === "DETAIL") return "Ficha do resultado";
    if (p.success && p.data.step === "TARGET") return "Meta do resultado";
    if (p.success && p.data.step === "INDICATOR") return "Indicador e verificação do resultado";
  }
  if (type === "IMPACT") {
    const p = impactPayloadSchema.safeParse(payload);
    if (p.success && p.data.step === "FOLLOW_UP") return "Acompanhamento do impacto";
  }
  return PROPOSAL_TITLES[type];
}

function outcomeLabel(snapshot: JourneySnapshot, outcomeId: string): string {
  const i = snapshot.outcomes.findIndex((o) => o.id === outcomeId);
  return i >= 0 ? `Resultado ${twoDigits(i + 1)}: ${stripTrailingPeriod(snapshot.outcomes[i].description)}` : "Resultado";
}

/** Exibe o conteúdo estruturado de uma proposta no formato da ficha aprovada. */
export function ProposalContent({
  type,
  payload,
  snapshot,
}: {
  type: ProposalTypeKey;
  payload: unknown;
  snapshot: JourneySnapshot;
}) {
  if (type === "ACTIVITY") {
    const list = activityListPayloadSchema.safeParse(payload);
    if (list.success) {
      const start = snapshot.activities.length;
      return (
        <ol className="space-y-1.5 text-sm">
          {list.data.activities.map((a, i) => (
            <li key={i}>
              <span className="font-semibold">Atividade {twoDigits(start + i + 1)}:</span> {stripTrailingPeriod(a.description)}
            </li>
          ))}
        </ol>
      );
    }
    const p = activityPayloadSchema.safeParse(payload);
    if (!p.success) return <InvalidPayload />;
    const a = p.data;
    const target = a.target.deadline && !a.target.description.toLowerCase().includes(a.target.deadline.toLowerCase())
      ? `${stripTrailingPeriod(a.target.description)} (prazo: ${a.target.deadline})`
      : a.target.description;
    return (
      <Ficha
        lines={[
          ["Atividade", stripTrailingPeriod(a.description)],
          ["Meta", target],
          ["Duração", durationText(a.target.durationMonths)],
          ["Indicadores", a.indicators.map((i) => i.name).join("; ")],
          ["Meio de verificação", a.evidences.map((e) => e.description).join("; ")],
        ]}
      />
    );
  }

  if (type === "OUTCOME") {
    const p = outcomePayloadSchema.safeParse(payload);
    if (!p.success) return <InvalidPayload />;
    const o = p.data;
    if (o.step === "STATEMENTS") {
      return (
        <ol className="space-y-3 text-sm">
          {o.outcomes.map((item, i) => {
            const related = snapshot.activities
              .map((a, idx) => ({ a, idx }))
              .filter(({ a }) => item.relatedActivityIds.includes(a.id));
            return (
              <li key={i} className="rounded-lg bg-muted/50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Resultado {twoDigits(snapshot.outcomes.length + i + 1)}
                </p>
                <p className="mt-1 font-medium">{stripTrailingPeriod(item.statement)}.</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  A partir de: {related.map(({ idx }) => `Atividade ${twoDigits(idx + 1)}`).join(", ") || "—"}
                </p>
              </li>
            );
          })}
        </ol>
      );
    }
    if (o.step === "DETAIL") {
      return (
        <div className="space-y-2">
          <p className="text-sm font-medium">{outcomeLabel(snapshot, o.outcomeId)}</p>
          <Ficha
            lines={[
              ["Meta", o.target],
              ["Indicador", o.indicators.map((i) => i.name).join("; ")],
              ["Meio de verificação", o.verification],
            ]}
          />
        </div>
      );
    }
    if (o.step === "TARGET") {
      return (
        <div className="space-y-2">
          <p className="text-sm font-medium">{outcomeLabel(snapshot, o.outcomeId)}</p>
          <Ficha lines={[["Meta", o.target]]} />
        </div>
      );
    }
    const outcome = snapshot.outcomes.find((x) => x.id === o.outcomeId);
    return (
      <div className="space-y-2">
        <p className="text-sm font-medium">{outcomeLabel(snapshot, o.outcomeId)}</p>
        <Ficha
          lines={[
            ["Meta", outcome?.target],
            ["Indicador", o.indicators.map((i) => i.name).join("; ")],
            ["Meio de verificação", o.verification],
          ]}
        />
      </div>
    );
  }

  if (type === "IMPACT") {
    const p = impactPayloadSchema.safeParse(payload);
    if (!p.success) return <InvalidPayload />;
    if (p.data.step === "STATEMENT") {
      return <p className="text-sm font-medium leading-relaxed">{p.data.statement}</p>;
    }
    const data = p.data;
    return (
      <div className="space-y-3 text-sm">
        <p>
          <span className="font-medium text-muted-foreground">Opção: </span>
          {IMPACT_OPTION_LABELS[data.option]}
        </p>
        {data.followUps.map((f, i) => (
          <Ficha
            key={i}
            className="rounded-lg bg-muted/50 p-3"
            lines={[
              [data.option === "FUTURE_EVALUATION" ? "Avaliação" : "Mudança", f.description],
              ["Meta", f.target],
              ["Indicador", f.indicator],
              ["Meio de verificação", f.verification],
              ["Período", f.periodAfterEnd],
              ...(f.notes ? ([["Observações", f.notes]] as Array<[string, string]>) : []),
            ]}
          />
        ))}
      </div>
    );
  }

  const p = evidencePlanPayloadSchema.safeParse(payload);
  if (!p.success) return <InvalidPayload />;
  return (
    <ul className="space-y-2 text-sm">
      {p.data.items.map((item) => (
        <li key={`${item.sourceType}:${item.sourceId}`} className="rounded-lg bg-muted/50 p-3">
          <p className="font-medium">{item.sourceLabel}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Coleta: <ValueOrToDefine value={item.collectionTiming} /> · Responsável:{" "}
            <ValueOrToDefine value={item.responsible} />
          </p>
        </li>
      ))}
    </ul>
  );
}

function InvalidPayload() {
  return <p className="text-sm text-destructive">Esta proposta tem um formato inválido. Use Editar ou Excluir.</p>;
}
