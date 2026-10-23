"use client";

import Link from "next/link";
import { Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Ficha } from "@/components/journey/ficha";
import { JourneyTable, ListCell, type JourneyColumn } from "@/components/journey/journey-table";
import { IMPACT_OPTION_LABELS } from "@/lib/journey/proposal-schemas";
import { ValueOrToDefine } from "@/components/journey/to-define";
import {
  activityTargetText,
  formatDuration,
  formatTerritories,
  stripTrailingPeriod,
  twoDigits,
  upperFirst,
} from "@/lib/journey/format";
import type { JourneyStageKey } from "@/lib/journey/stages";
import type { JourneySnapshot } from "@/lib/journey/types";

const ACTIVITY_COLUMNS: JourneyColumn[] = [
  { question: "O que vamos fazer?", title: "Atividade", className: "w-[28%]" },
  { question: "Quanto faremos e até quando?", title: "Meta da atividade" },
  { question: "O que vamos contar?", title: "Indicador" },
  { question: "Como comprovaremos?", title: "Meio de verificação" },
];

const OUTCOME_COLUMNS: JourneyColumn[] = [
  {
    question: "O que queremos que a atividade gere de mudança a médio prazo?",
    title: "Mudança esperada",
    className: "w-[28%]",
  },
  { question: "Quanto queremos alcançar e até quando?", title: "Meta da mudança" },
  { question: "O que vamos medir?", title: "Indicador de mudança" },
  { question: "Como comprovaremos a mudança?", title: "Meio de verificação" },
];

const IMPACT_COLUMNS: JourneyColumn[] = [
  {
    question: "Se o resultado for atingido, para qual mudança de longo prazo o projeto irá contribuir?",
    title: "Impacto",
    className: "w-[28%]",
  },
  { question: "Quanto dessa mudança queremos alcançar e até quando?", title: "Meta do impacto" },
  { question: "O que vamos medir?", title: "Indicador de impacto" },
  { question: "Como comprovaremos essa mudança?", title: "Meio de verificação" },
];

export type EditTarget = { kind: "activity"; id: string } | { kind: "outcome"; id: string } | { kind: "impact" };

export type DeleteTarget = { kind: "activity" | "outcome"; id: string; label: string };

/** Conteúdo confirmado de uma etapa, com ações de edição quando permitido. */
export function StageContent({
  stage,
  snapshot,
  canEdit,
  onEdit,
  onDelete,
  compact = false,
}: {
  stage: JourneyStageKey;
  snapshot: JourneySnapshot;
  canEdit: boolean;
  onEdit: (target: EditTarget) => void;
  onDelete: (target: DeleteTarget) => void;
  compact?: boolean;
}) {
  const p = snapshot.project;

  if (stage === "CONTEXT") {
    return (
      <div className="space-y-3 text-sm">
        <Ficha
          lines={[
            ["Área", p.areaLabel],
            ["Território", formatTerritories(p.territories)],
            ["Público", p.targetAudience],
            ["Duração", formatDuration(p.durationMonths)],
            ...(compact ? [] : ([["Problema", p.problem]] as Array<[string, string]>)),
          ]}
        />
        {canEdit && (
          <Button asChild variant="outline" size="sm">
            <Link href={`/projetos/${p.id}/editar`}>
              <Pencil aria-hidden /> Editar contexto
            </Link>
          </Button>
        )}
      </div>
    );
  }

  if (stage === "ACTIVITIES") {
    return (
      <JourneyTable
        label="Atividades e resultados"
        columns={ACTIVITY_COLUMNS}
        emptyText="Nenhuma atividade ainda."
        withActions={canEdit}
      >
        {snapshot.activities.map((a, i) => {
          const label = `Atividade ${twoDigits(i + 1)}`;
          return (
            <tr key={a.id} className="border-b align-top last:border-b-0">
              <td className="px-3 py-3">
                <span className="mb-1 block text-[11px] font-semibold text-muted-foreground">{twoDigits(i + 1)}</span>
                {upperFirst(stripTrailingPeriod(a.description))}
              </td>
              <td className="px-3 py-3">
                <ValueOrToDefine value={a.target ? activityTargetText(a) : null} />
              </td>
              <td className="px-3 py-3">
                <ListCell items={a.indicators.map((ind) => ind.name)} />
              </td>
              <td className="px-3 py-3">
                <ListCell items={a.evidences} />
              </td>
              {canEdit && (
                <td className="px-1 py-2">
                  <RowActions
                    label={label}
                    onEdit={() => onEdit({ kind: "activity", id: a.id })}
                    onDelete={() => onDelete({ kind: "activity", id: a.id, label })}
                  />
                </td>
              )}
            </tr>
          );
        })}
      </JourneyTable>
    );
  }

  if (stage === "OUTCOMES") {
    return (
      <JourneyTable
        label="Resultados de médio prazo"
        columns={OUTCOME_COLUMNS}
        emptyText="Nenhum resultado ainda."
        withActions={canEdit}
      >
        {snapshot.outcomes.map((o, i) => {
          const label = `Resultado ${twoDigits(i + 1)}`;
          return (
            <tr key={o.id} className="border-b align-top last:border-b-0">
              <td className="px-3 py-3">
                <span className="mb-1 block text-[11px] font-semibold text-muted-foreground">{twoDigits(i + 1)}</span>
                {upperFirst(stripTrailingPeriod(o.description))}
              </td>
              <td className="px-3 py-3">
                <ValueOrToDefine value={o.target} />
              </td>
              <td className="px-3 py-3">
                <ListCell items={o.indicators.map((ind) => ind.name)} />
              </td>
              <td className="px-3 py-3">
                <ListCell items={o.evidences} />
              </td>
              {canEdit && (
                <td className="px-1 py-2">
                  <RowActions
                    label={label}
                    onEdit={() => onEdit({ kind: "outcome", id: o.id })}
                    onDelete={() => onDelete({ kind: "outcome", id: o.id, label })}
                  />
                </td>
              )}
            </tr>
          );
        })}
      </JourneyTable>
    );
  }

  if (stage === "IMPACT") {
    const impact = snapshot.impact;
    // Uma linha por acompanhamento; a coluna do impacto se estende por todas.
    // Sem acompanhamento (visão de longo prazo ou ainda não escolhido), uma
    // única linha com as colunas de mensuração vazias.
    const followUps = impact?.followUps.length ? impact.followUps : [null];
    const empty =
      impact?.followUpOption === "VISION_ONLY" ? (
        <span className="text-muted-foreground">Não se aplica</span>
      ) : (
        <ValueOrToDefine value={null} />
      );
    return (
      <div className="space-y-3">
        <JourneyTable
          label="Impacto de longo prazo"
          columns={IMPACT_COLUMNS}
          emptyText="Nenhum impacto ainda."
          withActions={canEdit}
        >
          {impact
            ? followUps.map((f, i) => (
                <tr key={f?.id ?? "impacto"} className="border-b align-top last:border-b-0">
                  {i === 0 && (
                    <td rowSpan={followUps.length} className="border-r px-3 py-3">
                      {impact.statement}
                    </td>
                  )}
                  <td className="px-3 py-3">
                    {f ? (
                      <>
                        <span className="mb-1 block text-[11px] text-muted-foreground">{f.description}</span>
                        <ValueOrToDefine value={f.target} />
                        {f.periodAfterEnd && (
                          <span className="mt-1 block text-xs text-muted-foreground">Período: {f.periodAfterEnd}</span>
                        )}
                      </>
                    ) : (
                      empty
                    )}
                  </td>
                  <td className="px-3 py-3">{f ? <ValueOrToDefine value={f.indicator} /> : empty}</td>
                  <td className="px-3 py-3">{f ? <ValueOrToDefine value={f.verification} /> : empty}</td>
                  {canEdit && i === 0 && (
                    <td rowSpan={followUps.length} className="px-1 py-2">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => onEdit({ kind: "impact" })}
                        aria-label="Editar impacto"
                        title="Editar"
                      >
                        <Pencil aria-hidden />
                      </Button>
                    </td>
                  )}
                </tr>
              ))
            : []}
        </JourneyTable>
        {impact && (
          <p className="text-xs text-muted-foreground">
            Acompanhamento:{" "}
            {impact.followUpOption ? IMPACT_OPTION_LABELS[impact.followUpOption] : <ValueOrToDefine value={null} />}
          </p>
        )}
      </div>
    );
  }

  if (!snapshot.evidencePlan.length) return <Empty text="O plano de evidências ainda não foi consolidado." />;
  return (
    <div className="space-y-2 text-sm">
      <p>{snapshot.evidencePlan.length} linha(s) no plano.</p>
      <Button asChild variant="outline" size="sm">
        <Link href={`/projetos/${p.id}/plano-de-evidencias`}>Abrir plano de evidências</Link>
      </Button>
    </div>
  );
}

function RowActions({ label, onEdit, onDelete }: { label: string; onEdit: () => void; onDelete: () => void }) {
  return (
    <div className="flex gap-0.5">
      <Button variant="ghost" size="icon-sm" onClick={onEdit} aria-label={`Editar ${label}`} title="Editar">
        <Pencil aria-hidden />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={onDelete}
        aria-label={`Excluir ${label}`}
        title="Excluir"
        className="text-destructive"
      >
        <Trash2 aria-hidden />
      </Button>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="text-sm text-muted-foreground">{text}</p>;
}
