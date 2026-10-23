"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Bot, CheckCircle2, Loader2, RotateCcw, SendHorizontal, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { FormAlert } from "@/components/form/form-alert";
import { RichText } from "@/components/journey/rich-text";
import { ProposalContent, proposalTitle } from "@/components/journey/proposal-view";
import type { JourneyController } from "@/components/journey/use-journey";
import { ACTION_IDS, isProposalAction, navigatePath } from "@/lib/journey/actions";
import type { JourneyAIAction } from "@/lib/journey-ai/response-schema";
import type { MessageView, ProposalView } from "@/lib/journey/view-types";
import { cn } from "@/lib/utils";

const variantFor = (intent: JourneyAIAction["intent"]) =>
  intent === "APPROVE" ? "default" : intent === "DELETE" ? "destructive" : intent === "CONTINUE" ? "secondary" : "outline";

export function ChatPanel({
  journey,
  onEditProposal,
}: {
  journey: JourneyController;
  onEditProposal: (proposal: ProposalView) => void;
}) {
  const router = useRouter();
  const { view, busy, pendingUserText } = journey;
  const [text, setText] = useState("");
  const [inputError, setInputError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const lastAssistant = [...view.messages].reverse().find((m) => m.role === "ASSISTANT");

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [view.messages.length, pendingUserText, busy]);

  async function onSend(event?: React.FormEvent) {
    event?.preventDefault();
    const value = text.trim();
    if (!value) {
      setInputError("Escreva uma mensagem antes de enviar.");
      return;
    }
    if (value.length > 4000) {
      setInputError("A mensagem deve ter no máximo 4.000 caracteres.");
      return;
    }
    setInputError(null);
    setText("");
    const error = await journey.sendMessage(value);
    if (error) {
      setText(value);
      if (error.fieldErrors?.text) setInputError(error.fieldErrors.text[0]);
    }
  }

  function onAction(action: JourneyAIAction) {
    const path = navigatePath(action.id);
    if (path) {
      router.push(path);
      return;
    }
    const pending = view.pendingProposal;
    if (action.id === ACTION_IDS.APPROVE_PROPOSAL && pending) return void journey.decideProposal(pending.id, "APPROVE");
    if (action.id === ACTION_IDS.EDIT_PROPOSAL && pending) return onEditProposal(pending);
    if (action.id === ACTION_IDS.REJECT_PROPOSAL && pending) return void journey.decideProposal(pending.id, "REJECT");
    void journey.sendAction(action.id);
  }

  return (
    <section aria-label="Conversa com o consultor virtual" className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6" aria-live="polite" aria-relevant="additions">
        <ol className="mx-auto flex max-w-2xl flex-col gap-5">
          {view.messages.map((m) => (
            <li key={m.id}>
              <Message
                message={m}
                proposal={m.proposalId ? view.proposals[m.proposalId] : undefined}
                isLatest={m.id === lastAssistant?.id}
                interactive={view.canEdit && !busy}
                journey={journey}
                onAction={onAction}
                onEditProposal={onEditProposal}
              />
            </li>
          ))}
          {pendingUserText && (
            <li>
              <UserBubble text={pendingUserText} />
            </li>
          )}
          {busy && (
            <li className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
              <Loader2 className="size-4 animate-spin" aria-hidden /> O consultor está preparando a resposta…
            </li>
          )}
        </ol>
        <div ref={endRef} />
      </div>

      <div className="border-t bg-card px-4 py-3 sm:px-6">
        <div className="mx-auto max-w-2xl space-y-2">
          {(journey.error || view.canRetry) && (
            <FormAlert>
              <div className="space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <span>{journey.error ?? "O consultor virtual não respondeu à última solicitação."}</span>
                  {journey.error && (
                    <button type="button" onClick={journey.dismissError} className="text-xs underline">
                      Fechar
                    </button>
                  )}
                </div>
                {view.canRetry && (
                  <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void journey.retry()}>
                    <RotateCcw aria-hidden /> Tentar novamente
                  </Button>
                )}
              </div>
            </FormAlert>
          )}
          {journey.notice && !journey.error && (
            <p className="sr-only" role="status">
              {journey.notice}
            </p>
          )}
          {view.canEdit ? (
            <form onSubmit={onSend} className="flex items-end gap-2">
              <label htmlFor="chat-input" className="sr-only">
                Sua resposta ao consultor
              </label>
              <Textarea
                id="chat-input"
                value={text}
                rows={2}
                maxLength={4000}
                placeholder="Escreva sua resposta…"
                aria-invalid={Boolean(inputError)}
                aria-describedby={inputError ? "chat-input-error" : "chat-input-hint"}
                className="max-h-40 min-h-12 resize-y"
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    void onSend();
                  }
                }}
              />
              <Button type="submit" size="icon-lg" disabled={busy} aria-label="Enviar mensagem" className="size-12">
                <SendHorizontal aria-hidden />
              </Button>
            </form>
          ) : (
            <p className="text-center text-sm text-muted-foreground">
              Visualização somente leitura: seu perfil não pode alterar este projeto.
            </p>
          )}
          {view.canEdit &&
            (inputError ? (
              <p id="chat-input-error" className="text-sm text-destructive">
                {inputError}
              </p>
            ) : (
              <p id="chat-input-hint" className="text-[11px] text-muted-foreground">
                Enter envia · Shift+Enter quebra linha · Não inclua dados pessoais de participantes.
              </p>
            ))}
        </div>
      </div>
    </section>
  );
}

function UserBubble({ text }: { text: string }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-primary px-4 py-2.5 text-sm text-primary-foreground">
        <span className="sr-only">Você: </span>
        {text}
      </div>
    </div>
  );
}

function Message({
  message,
  proposal,
  isLatest,
  interactive,
  journey,
  onAction,
  onEditProposal,
}: {
  message: MessageView;
  proposal?: ProposalView;
  isLatest: boolean;
  interactive: boolean;
  journey: JourneyController;
  onAction: (action: JourneyAIAction) => void;
  onEditProposal: (proposal: ProposalView) => void;
}) {
  if (message.role === "USER") return <UserBubble text={message.content} />;
  const actions = message.actions.filter((a) => !isProposalAction(a.id));
  return (
    <div className="flex gap-3">
      <span aria-hidden className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary text-primary">
        <Bot className="size-4" />
      </span>
      <div className="min-w-0 flex-1 space-y-3">
        <div className="rounded-2xl rounded-tl-sm border bg-card px-4 py-3 text-sm leading-relaxed shadow-xs">
          <span className="sr-only">Consultor: </span>
          <RichText text={message.content} />
        </div>
        {proposal && (
          <ProposalCard
            proposal={proposal}
            journey={journey}
            interactive={interactive && proposal.status === "PENDING"}
            onEdit={() => onEditProposal(proposal)}
          />
        )}
        {isLatest && interactive && actions.length > 0 && (
          <div className="flex flex-wrap gap-2" role="group" aria-label="Opções do consultor">
            {actions.map((a) => (
              <Button key={a.id} variant={variantFor(a.intent)} onClick={() => onAction(a)}>
                {a.label}
              </Button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const STATUS_LABEL: Record<ProposalView["status"], { label: string; icon: typeof CheckCircle2; className: string }> = {
  PENDING: { label: "Aguardando sua decisão", icon: AlertTriangle, className: "text-warning" },
  APPROVED: { label: "Aprovada", icon: CheckCircle2, className: "text-success" },
  REJECTED: { label: "Excluída", icon: XCircle, className: "text-muted-foreground" },
  SUPERSEDED: { label: "Substituída", icon: XCircle, className: "text-muted-foreground" },
};

function ProposalCard({
  proposal,
  journey,
  interactive,
  onEdit,
}: {
  proposal: ProposalView;
  journey: JourneyController;
  interactive: boolean;
  onEdit: () => void;
}) {
  const status = STATUS_LABEL[proposal.status];
  const StatusIcon = status.icon;
  const pending = proposal.status === "PENDING";
  return (
    <article
      aria-label={proposalTitle(proposal.type, proposal.payload)}
      className={cn(
        "rounded-xl border bg-card p-4",
        pending ? "border-primary/30 shadow-sm ring-1 ring-primary/10" : "opacity-80",
      )}
    >
      <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{proposalTitle(proposal.type, proposal.payload)}</h3>
        <div className="flex items-center gap-2">
          {proposal.isMock && <Badge variant="outline">Sugestão de teste</Badge>}
          <span className={cn("inline-flex items-center gap-1 text-xs font-medium", status.className)}>
            <StatusIcon className="size-3.5" aria-hidden /> {status.label}
          </span>
        </div>
      </header>
      <ProposalContent type={proposal.type} payload={proposal.payload} snapshot={journey.view.snapshot} />
      {pending && proposal.warnings.length > 0 && (
        <ul className="mt-3 space-y-1 rounded-lg border border-warning/30 bg-warning-soft px-3 py-2 text-xs text-warning">
          {proposal.warnings.map((w, i) => (
            <li key={i}>{w.message}</li>
          ))}
        </ul>
      )}
      {interactive && (
        <div className="mt-4 flex flex-wrap gap-2">
          <Button onClick={() => journey.decideProposal(proposal.id, "APPROVE")} disabled={proposal.warnings.length > 0}>
            Aprovar
          </Button>
          <Button variant="outline" onClick={onEdit}>
            Editar
          </Button>
          <Button variant="destructive" onClick={() => journey.decideProposal(proposal.id, "REJECT")}>
            Excluir
          </Button>
        </div>
      )}
    </article>
  );
}
