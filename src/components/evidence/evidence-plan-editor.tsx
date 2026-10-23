"use client";

import { useState } from "react";
import { Pencil, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormAlert } from "@/components/form/form-alert";
import { TextAreaField, TextField } from "@/components/form/field";
import { EditDialog } from "@/components/journey/edit-dialog";
import { ValueOrToDefine } from "@/components/journey/to-define";
import { ApiError, apiFetch } from "@/lib/client/api";
import { evidencePlanItemEditSchema } from "@/lib/journey/api-schemas";
import type { EvidencePlanItemView } from "@/lib/journey/types";
import type { JourneyViewState } from "@/lib/journey/view-types";

const COLUMNS: Array<[keyof EvidencePlanItemView, string]> = [
  ["target", "Meta"],
  ["indicator", "Indicador"],
  ["verification", "Meio de verificação"],
  ["collectionTiming", "Quando coletar"],
  ["responsible", "Quem registrará"],
  ["instrument", "Instrumento necessário"],
  ["pending", "Pendências"],
];

const SOURCE_LABEL = { ACTIVITY: "Atividade", OUTCOME: "Resultado", IMPACT: "Impacto" } as const;

export function EvidencePlanEditor({
  initial,
  canReconsolidate,
}: {
  initial: JourneyViewState;
  canReconsolidate: boolean;
}) {
  const [view, setView] = useState(initial);
  const [editing, setEditing] = useState<EvidencePlanItemView | null>(null);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const projectId = view.snapshot.project.id;
  const items = view.snapshot.evidencePlan;

  async function save(item: EvidencePlanItemView, data: unknown): Promise<ApiError | null> {
    try {
      setView(
        await apiFetch<JourneyViewState>(`/api/projects/${projectId}/evidence-plan/${item.id}`, {
          method: "PATCH",
          body: data,
        }),
      );
      setMessage({ tone: "success", text: "Linha atualizada." });
      return null;
    } catch (e) {
      return e instanceof ApiError ? e : new ApiError("Não foi possível salvar.", 500);
    }
  }

  async function reconsolidate() {
    setBusy(true);
    setMessage(null);
    try {
      setView(await apiFetch<JourneyViewState>(`/api/projects/${projectId}/evidence-plan`, { method: "POST", body: {} }));
      setMessage({ tone: "success", text: "Plano reconsolidado a partir do conteúdo aprovado." });
    } catch (e) {
      setMessage({ tone: "error", text: e instanceof ApiError ? e.message : "Não foi possível reconsolidar." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      {message && <FormAlert tone={message.tone}>{message.text}</FormAlert>}
      {view.canEdit && canReconsolidate && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4 text-sm">
          <p className="text-muted-foreground">
            Alterou atividades, resultados ou o impacto? Reconsolide para atualizar o plano sem perder o que já foi
            detalhado.
          </p>
          <Button variant="outline" onClick={reconsolidate} disabled={busy}>
            <RefreshCw className={busy ? "animate-spin" : undefined} aria-hidden /> Reconsolidar plano
          </Button>
        </div>
      )}

      {items.length === 0 ? (
        <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          O plano de evidências é consolidado na Etapa 5 da jornada, depois da aprovação do impacto de longo prazo.
        </p>
      ) : (
        <>
          <div className="hidden overflow-x-auto rounded-xl border bg-card xl:block">
            <table className="w-full min-w-[1100px] border-collapse text-left text-sm">
              <caption className="sr-only">Plano de evidências do projeto</caption>
              <thead className="bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th scope="col" className="px-3 py-3 font-semibold">
                    Relacionado a
                  </th>
                  {COLUMNS.map(([key, label]) => (
                    <th key={key} scope="col" className="px-3 py-3 font-semibold">
                      {label}
                    </th>
                  ))}
                  {view.canEdit && (
                    <th scope="col" className="px-3 py-3">
                      <span className="sr-only">Ações</span>
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className="border-t align-top">
                    <th scope="row" className="max-w-56 px-3 py-3 font-medium">
                      <span className="block text-[11px] uppercase text-muted-foreground">
                        {SOURCE_LABEL[item.sourceType]}
                      </span>
                      {item.sourceLabel}
                    </th>
                    {COLUMNS.map(([key]) => (
                      <td key={key} className="max-w-56 px-3 py-3">
                        <ValueOrToDefine value={item[key] as string | null} />
                      </td>
                    ))}
                    {view.canEdit && (
                      <td className="px-3 py-3">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setEditing(item)}
                          aria-label={`Editar linha: ${item.sourceLabel}`}
                        >
                          <Pencil aria-hidden /> Editar
                        </Button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="space-y-4 xl:hidden">
            {items.map((item) => (
              <li key={item.id} className="rounded-xl border bg-card p-4">
                <p className="text-[11px] font-semibold uppercase text-muted-foreground">{SOURCE_LABEL[item.sourceType]}</p>
                <p className="font-medium">{item.sourceLabel}</p>
                <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                  {COLUMNS.map(([key, label]) => (
                    <div key={key}>
                      <dt className="text-xs text-muted-foreground">{label}</dt>
                      <dd>
                        <ValueOrToDefine value={item[key] as string | null} />
                      </dd>
                    </div>
                  ))}
                </dl>
                {view.canEdit && (
                  <Button variant="outline" size="sm" className="mt-3" onClick={() => setEditing(item)}>
                    <Pencil aria-hidden /> Editar linha
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      {editing && (
        <EditDialog
          open
          onOpenChange={(open) => !open && setEditing(null)}
          title="Editar linha do plano"
          description={`${editing.sourceLabel}. Meta, indicador e verificação vêm das etapas aprovadas.`}
          initial={{
            collectionTiming: editing.collectionTiming ?? "",
            responsible: editing.responsible ?? "",
            instrument: editing.instrument ?? "",
            pending: editing.pending ?? "",
          }}
          schema={evidencePlanItemEditSchema}
          submitLabel="Salvar"
          onSubmit={(data) => save(editing, data)}
          render={(v, set, errors) => (
            <div className="space-y-4">
              <TextField
                label="Quando será coletado"
                hint="Deixe em branco para “a definir”."
                value={v.collectionTiming}
                onChange={(collectionTiming) => set({ ...v, collectionTiming })}
                error={errors.collectionTiming}
              />
              <TextField
                label="Quem registrará"
                hint="Função ou equipe (sem dados pessoais)."
                value={v.responsible}
                onChange={(responsible) => set({ ...v, responsible })}
                error={errors.responsible}
              />
              <TextField
                label="Instrumento necessário"
                value={v.instrument}
                onChange={(instrument) => set({ ...v, instrument })}
                error={errors.instrument}
              />
              <TextAreaField
                label="Pendências ou decisões em aberto"
                value={v.pending}
                onChange={(pending) => set({ ...v, pending })}
                error={errors.pending}
              />
            </div>
          )}
        />
      )}
    </div>
  );
}
