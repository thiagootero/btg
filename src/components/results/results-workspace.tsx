"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle2, ChevronRight, Circle, CircleDot } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FormAlert } from "@/components/form/form-alert";
import { PublicLinkActions } from "@/components/results/public-link-actions";
import { ResultCard, type CardRequest } from "@/components/results/result-card";
import { ApiError, apiFetch } from "@/lib/client/api";
import { RESULT_SECTIONS, RESULT_SOURCE_TYPES } from "@/lib/results/items";
import { publicPath } from "@/lib/results/public";
import type { ResultCardView, ResultsViewState } from "@/lib/results/view";

const SUCCESS: Record<CardRequest["kind"], string> = {
  save: "Rascunho salvo.",
  organize: "Proposta de texto gerada. Revise antes de aprovar.",
  approve: "Texto técnico aprovado.",
  discard: "Proposta descartada.",
};

/** Situação do item na lista: o que falta para concluí-lo. */
function rowStatus(card: ResultCardView) {
  if (card.status === "APPROVED" && card.approvedText) {
    return { label: "Concluído", Icon: CheckCircle2, className: "text-success" };
  }
  if (card.status === "AI_PROPOSED") {
    return { label: "Texto para revisar", Icon: CircleDot, className: "text-warning" };
  }
  if (card.complete) {
    return { label: "Preenchido · texto pendente", Icon: CircleDot, className: "text-warning" };
  }
  if (card.filledCount > 0) {
    return {
      label: `Preenchido parcialmente (${card.filledCount} de ${card.indicators.length} indicadores)`,
      Icon: CircleDot,
      className: "text-warning",
    };
  }
  return { label: "Não preenchido", Icon: Circle, className: "text-muted-foreground" };
}

/** Intervalo e limite da espera pelas perguntas personalizadas (geradas em segundo plano). */
const FORM_POLL_MS = 4000;
const FORM_POLL_MAX_MS = 3 * 60_000;

/**
 * Aplica só as perguntas recém-geradas à visão atual. Os dados registrados
 * continuam os da tela, para não desfazer um salvamento feito durante a espera.
 */
function withForms(current: ResultsViewState, next: ResultsViewState): ResultsViewState {
  const forms = new Map(next.cards.map((c) => [c.recordId, c]));
  return {
    ...current,
    evaluation:
      current.evaluation && next.evaluation
        ? { ...current.evaluation, formReady: next.evaluation.formReady, formSource: next.evaluation.formSource }
        : next.evaluation,
    cards: current.cards.map((card) => {
      const fresh = forms.get(card.recordId);
      if (!fresh || fresh.indicators.length !== card.indicators.length) return card;
      return {
        ...card,
        form: fresh.form,
        indicators: card.indicators.map((i, index) => ({ ...i, form: fresh.indicators[index].form })),
      };
    }),
  };
}

/** Remonta o card quando o servidor devolve uma nova versão dele. */
function cardKey(card: ResultCardView): string {
  return [card.recordId, card.status, card.proposedText, card.approvedText, JSON.stringify(card.data)].join("|");
}

export function ResultsWorkspace({ initial }: { initial: ResultsViewState }) {
  const [view, setView] = useState(initial);
  const [busy, setBusy] = useState<{
    recordId: string;
    kind: CardRequest["kind"];
  } | null>(null);
  const [message, setMessage] = useState<{
    tone: "success" | "error";
    text: string;
  } | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const dirtyRef = useRef(false);
  const onDirtyChange = useCallback((dirty: boolean) => {
    dirtyRef.current = dirty;
  }, []);
  const projectId = view.project.id;
  const openCard = view.cards.find((c) => c.recordId === openId) ?? null;
  const waitingForms = view.canEdit && view.evaluation !== null && !view.evaluation.formReady;

  // Perguntas personalizadas ainda em preparo: consulta até ficarem prontas.
  useEffect(() => {
    if (!waitingForms) return;
    const startedAt = Date.now();
    let cancelled = false;
    const timer = setInterval(async () => {
      if (Date.now() - startedAt > FORM_POLL_MAX_MS) return clearInterval(timer);
      try {
        const next = await apiFetch<ResultsViewState>(`/api/projects/${projectId}/results`);
        if (!cancelled && next.evaluation?.formReady) setView((current) => withForms(current, next));
      } catch {
        // Falha temporária: tenta de novo no próximo ciclo.
      }
    }, FORM_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [waitingForms, projectId]);

  function open(recordId: string) {
    dirtyRef.current = false;
    setMessage(null);
    setOpenId(recordId);
  }

  function close() {
    if (busy) return;
    if (dirtyRef.current && !window.confirm("Há dados não salvos neste item. Fechar mesmo assim?")) return;
    dirtyRef.current = false;
    setOpenId(null);
  }

  async function handle(recordId: string, request: CardRequest): Promise<Record<string, string[]> | null> {
    setBusy({ recordId, kind: request.kind });
    setMessage(null);
    const base = `/api/projects/${projectId}/results/${recordId}`;
    try {
      const next =
        request.kind === "organize"
          ? await apiFetch<ResultsViewState>(`${base}/organize`, {
              method: "POST",
              body: { data: request.data },
            })
          : await apiFetch<ResultsViewState>(base, {
              method: "PATCH",
              body:
                request.kind === "save"
                  ? { action: "save", data: request.data }
                  : request.kind === "approve"
                    ? { action: "approve", text: request.text }
                    : { action: "discard" },
            });
      setView(next);
      setMessage(
        next.aiError ? { tone: "error", text: next.aiError } : { tone: "success", text: SUCCESS[request.kind] },
      );
      return null;
    } catch (e) {
      const error = e instanceof ApiError ? e : new ApiError("Não foi possível salvar.", 500);
      setMessage({ tone: "error", text: error.message });
      // Erros do formulário chegam como "data.campo"; o card usa só o nome do campo.
      const fields: Record<string, string[]> = {};
      for (const [key, list] of Object.entries(error.fieldErrors ?? {})) fields[key.replace(/^data\./, "")] = list;
      return fields;
    } finally {
      setBusy(null);
    }
  }

  const completed = view.evaluation?.status === "COMPLETED";

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-card px-4 py-3">
        <p className="text-sm text-muted-foreground">
          Os resultados registrados aparecem na página pública da organização. O texto técnico só aparece depois de
          aprovado.
        </p>
        <PublicLinkActions path={publicPath(view.project.organizationId, projectId)} label="Página pública" />
      </div>

      {message && !openCard && (
        <div aria-live="polite">
          <FormAlert tone={message.tone}>{message.text}</FormAlert>
        </div>
      )}

      {view.readyForSynthesis && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-success/30 bg-success-soft p-4 text-sm">
          <p className="flex items-center gap-2 text-success">
            <CheckCircle2 className="size-4 shrink-0" aria-hidden />
            {completed
              ? "Registro de resultados finalizado."
              : `Todos os itens de “${RESULT_SECTIONS.OUTCOME.title}” têm texto técnico aprovado.`}
          </p>
          <Button asChild size="sm">
            <Link href={`/projetos/${projectId}/resultados/sintese`}>
              Ver avaliação final <ArrowRight aria-hidden />
            </Link>
          </Button>
        </div>
      )}

      {waitingForms && view.cards.length > 0 && (
        <FormAlert tone="info">
          As perguntas personalizadas para este projeto estão sendo preparadas. Enquanto isso, você já pode registrar os
          resultados com as perguntas padrão.
        </FormAlert>
      )}

      {view.cards.length === 0 ? (
        <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          {view.canEdit
            ? "Não há itens aprovados na Jornada para registrar."
            : "A organização ainda não iniciou o registro de resultados."}
        </p>
      ) : (
        RESULT_SOURCE_TYPES.map((type) => {
          const cards = view.cards.filter((c) => c.sourceType === type);
          if (cards.length === 0) return null;
          const section = RESULT_SECTIONS[type];
          return (
            <section key={type} aria-labelledby={`secao-${type}`} className="space-y-4 pt-2">
              <h2 id={`secao-${type}`} className="text-lg font-semibold">
                {section.number}. {section.title}
                {type !== "OUTCOME" && (
                  <span className="ml-2 text-sm font-normal text-muted-foreground">(opcional)</span>
                )}
              </h2>
              <ul className="divide-y overflow-hidden rounded-xl border bg-card">
                {cards.map((card) => {
                  const status = rowStatus(card);
                  return (
                    <li key={card.recordId}>
                      <button
                        type="button"
                        onClick={() => open(card.recordId)}
                        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none"
                      >
                        <status.Icon className={`size-5 shrink-0 ${status.className}`} aria-hidden />
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm">
                            <span className="font-semibold">{card.label}:</span> {card.reference.item}
                          </span>
                          <span className={`text-xs ${status.className}`}>{status.label}</span>
                        </span>
                        <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })
      )}

      <Dialog open={openCard !== null} onOpenChange={(isOpen) => !isOpen && close()}>
        {openCard && (
          <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl">
            <DialogHeader>
              <DialogTitle>{openCard.label}</DialogTitle>
              <DialogDescription>{RESULT_SECTIONS[openCard.sourceType].title}</DialogDescription>
            </DialogHeader>
            {message && (
              <div aria-live="polite">
                <FormAlert tone={message.tone}>{message.text}</FormAlert>
              </div>
            )}
            <ResultCard
              key={cardKey(openCard)}
              card={openCard}
              canEdit={view.canEdit}
              busy={busy?.recordId === openCard.recordId ? busy.kind : null}
              onRequest={(request) => handle(openCard.recordId, request)}
              onDirtyChange={onDirtyChange}
            />
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}
