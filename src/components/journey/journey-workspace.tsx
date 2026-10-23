"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ClipboardCheck,
  FileText,
  Globe,
  MessageSquare,
  PanelRightClose,
  PanelRightOpen,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ConfirmDialog } from "@/components/form/confirm-dialog";
import { ChatPanel } from "@/components/journey/chat-panel";
import {
  ActivityEditDialog,
  ImpactEditDialog,
  OutcomeEditDialog,
  ProposalEditorDialog,
} from "@/components/journey/journey-editors";
import { ProposalContent, proposalTitle } from "@/components/journey/proposal-view";
import { StageContent, type DeleteTarget, type EditTarget } from "@/components/journey/stage-content";
import { JourneyStepper } from "@/components/journey/stage-nav";
import { useJourney, type JourneyController } from "@/components/journey/use-journey";
import { stageApprovalBlockers } from "@/lib/journey/progress";
import { publicPath } from "@/lib/results/public";
import {
  STAGE_LABELS,
  VISIBLE_STAGES,
  stageStates,
  stageTitle,
  summaryReady,
  type JourneyStageKey,
  type JourneyStep,
} from "@/lib/journey/stages";
import type { JourneyViewState, ProposalView } from "@/lib/journey/view-types";

export function JourneyWorkspace({ initial }: { initial: JourneyViewState }) {
  const journey = useJourney(initial);
  const { view } = journey;
  const [editingProposal, setEditingProposal] = useState<ProposalView | null>(null);
  const [editTarget, setEditTarget] = useState<EditTarget | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [reopenStage, setReopenStage] = useState<JourneyStageKey | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const started = useRef(false);

  // Passo exibido no centro: acompanha a etapa atual (ou o resumo, quando o
  // impacto foi aprovado), mas a pessoa pode consultar qualquer outro.
  const currentStage = view.snapshot.currentStage;
  const ready = summaryReady(view.snapshot.approvedStages);
  const activeStep: JourneyStep = ready ? "SUMMARY" : (currentStage ?? "SUMMARY");
  const [selectedStep, setSelectedStep] = useState<JourneyStep>(activeStep);
  // No resumo a conversa já começa recolhida.
  const [chatCollapsed, setChatCollapsed] = useState(activeStep === "SUMMARY");
  const [trackedStep, setTrackedStep] = useState(activeStep);
  if (trackedStep !== activeStep) {
    setTrackedStep(activeStep);
    setSelectedStep(activeStep);
    if (activeStep === "SUMMARY") setChatCollapsed(true);
  }

  // O contexto vem do formulário do projeto e é aprovado direto na tela, sem
  // conversa; nas demais etapas o consultor fica sempre ao lado.
  const showChat = selectedStep !== "CONTEXT";

  // Primeira vez que a conversa aparece (com o contexto já aprovado): o
  // consultor a abre.
  useEffect(() => {
    if (showChat && currentStage !== "CONTEXT" && !started.current && view.canEdit && view.messages.length === 0) {
      started.current = true;
      void journey.start();
    }
  }, [showChat, currentStage, view.canEdit, view.messages.length, journey]);

  const handleEdit = (target: EditTarget) => setEditTarget(target);
  const handleDelete = (target: DeleteTarget) => setDeleteTarget(target);
  const handleEditProposal = (proposal: ProposalView) => {
    setChatOpen(false);
    setEditingProposal(proposal);
  };

  const project = view.snapshot.project;
  const stageLabel = ready || !currentStage ? "Resumo da jornada" : stageTitle(currentStage);

  return (
    <div className="flex h-[calc(100dvh-3.5rem-3.5rem)] min-h-0 md:h-[calc(100dvh-3.5rem)]">
      {/* Coluna principal: cabeçalho do projeto, passo a passo e etapa */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Cabeçalho do projeto */}
        <div className="flex items-center gap-3 border-b bg-card px-4 py-2.5 sm:px-6">
          <Link
            href="/projetos"
            className="text-muted-foreground hover:text-foreground"
            aria-label="Voltar para Projetos"
          >
            <ArrowLeft className="size-4" aria-hidden />
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-base font-semibold">{project.name}</h1>
            <p className="truncate text-xs text-muted-foreground">
              {project.organizationName} · {stageLabel}
            </p>
          </div>
          {project.isDemo && <Badge variant="outline">Demonstração</Badge>}
          <div className="flex gap-1">
            <Button asChild variant="ghost" size="sm" aria-label="Resultados do projeto">
              <Link href={`/projetos/${project.id}/resultados`}>
                <ClipboardCheck aria-hidden /> <span className="hidden md:inline">Resultados</span>
              </Link>
            </Button>
            <Button asChild variant="ghost" size="sm" aria-label="Página pública do projeto (abre em nova aba)">
              <a href={publicPath(project.organizationId, project.id)} target="_blank" rel="noopener noreferrer">
                <Globe aria-hidden /> <span className="hidden md:inline">Página pública</span>
              </a>
            </Button>
            <Button asChild variant="ghost" size="sm" aria-label="Relatório geral">
              <Link href={`/projetos/${project.id}/relatorio`}>
                <FileText aria-hidden /> <span className="hidden md:inline">Relatório</span>
              </Link>
            </Button>
            {showChat && (
              <Button
                variant="outline"
                size="sm"
                className="lg:hidden"
                onClick={() => setChatOpen(true)}
                aria-label="Abrir conversa com o consultor"
              >
                <MessageSquare aria-hidden /> <span className="hidden sm:inline">Consultor</span>
              </Button>
            )}
          </div>
        </div>

        <JourneyStepper journey={journey} selectedStep={selectedStep} onSelectStep={setSelectedStep} />

        <main className="min-h-0 flex-1 overflow-y-auto" aria-label="Informações da etapa">
          {selectedStep === "SUMMARY" ? (
            <SummaryView journey={journey} />
          ) : (
            <StageView
              stage={selectedStep}
              journey={journey}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onReopen={setReopenStage}
            />
          )}
        </main>
      </div>

      {/* Conversa em toda a altura, recolhível para dar mais espaço à etapa */}
      {showChat &&
        (chatCollapsed ? (
          <aside className="hidden w-12 shrink-0 flex-col items-center border-l bg-sidebar py-3 lg:flex">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setChatCollapsed(false)}
              aria-label="Expandir conversa com o consultor"
              title="Expandir conversa"
            >
              <PanelRightOpen aria-hidden />
            </Button>
            <button
              type="button"
              onClick={() => setChatCollapsed(false)}
              className="mt-3 flex flex-col items-center gap-2 text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              <MessageSquare className="size-4" aria-hidden />
              <span className="[writing-mode:vertical-rl]">Consultor virtual</span>
            </button>
          </aside>
        ) : (
          <aside className="hidden min-h-0 w-[30%] min-w-80 shrink-0 flex-col border-l bg-sidebar lg:flex">
            <div className="flex items-center justify-between gap-2 border-b bg-card px-4 py-2.5">
              <h2 className="flex items-center gap-2 text-sm font-semibold">
                <MessageSquare className="size-4 text-primary" aria-hidden /> Consultor virtual
                <AIModeBadge mode={journey.view.aiMode} />
              </h2>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setChatCollapsed(true)}
                aria-label="Recolher conversa"
                title="Recolher conversa"
              >
                <PanelRightClose aria-hidden />
              </Button>
            </div>
            <div className="min-h-0 flex-1">
              <ChatPanel journey={journey} onEditProposal={handleEditProposal} />
            </div>
          </aside>
        ))}

      {/* Conversa recolhível no celular */}
      <Sheet open={showChat && chatOpen} onOpenChange={setChatOpen}>
        <SheetContent side="right" className="flex w-[90vw] max-w-md flex-col gap-0 p-0">
          <SheetHeader className="border-b">
            <SheetTitle className="flex items-center gap-2">
              Consultor virtual <AIModeBadge mode={journey.view.aiMode} />
            </SheetTitle>
            <SheetDescription>Construa cada etapa conversando com o consultor.</SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1">
            <ChatPanel journey={journey} onEditProposal={handleEditProposal} />
          </div>
        </SheetContent>
      </Sheet>

      <ConfirmDialog
        open={reopenStage !== null}
        onOpenChange={(open) => !open && setReopenStage(null)}
        title="Reabrir esta etapa?"
        description="O conteúdo aprovado é mantido, mas esta etapa e as seguintes precisarão ser aprovadas novamente."
        confirmLabel="Reabrir etapa"
        onConfirm={() => {
          if (reopenStage) void journey.changeStage(reopenStage, "reopen", true);
          setReopenStage(null);
        }}
      />
      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={`Excluir ${deleteTarget?.label ?? ""}?`}
        description="O item aprovado será removido do projeto, assim como as linhas do plano de evidências ligadas a ele."
        confirmLabel="Excluir"
        destructive
        onConfirm={() => {
          if (deleteTarget?.kind === "activity") void journey.deleteActivity(deleteTarget.id);
          if (deleteTarget?.kind === "outcome") void journey.deleteOutcome(deleteTarget.id);
          setDeleteTarget(null);
        }}
      />

      {editingProposal && (
        <ProposalEditorDialog
          proposal={editingProposal}
          open
          onOpenChange={(open) => !open && setEditingProposal(null)}
          journey={journey}
        />
      )}
      {editTarget?.kind === "activity" && (
        <ActivityEditDialog
          activity={view.snapshot.activities.find((a) => a.id === editTarget.id)!}
          open
          onOpenChange={(open) => !open && setEditTarget(null)}
          journey={journey}
        />
      )}
      {editTarget?.kind === "outcome" && (
        <OutcomeEditDialog
          outcomeId={editTarget.id}
          open
          onOpenChange={(open) => !open && setEditTarget(null)}
          journey={journey}
        />
      )}
      {editTarget?.kind === "impact" && (
        <ImpactEditDialog open onOpenChange={(open) => !open && setEditTarget(null)} journey={journey} />
      )}
    </div>
  );
}

/** Resumo final: tudo o que foi aprovado na jornada, só para leitura. */
function SummaryView({ journey }: { journey: JourneyController }) {
  const { snapshot } = journey.view;
  const noop = () => {};

  if (!summaryReady(snapshot.approvedStages)) {
    return (
      <div className="space-y-2 px-4 py-6 sm:px-6 lg:px-8">
        <h2 className="text-lg font-semibold">Resumo da jornada</h2>
        <p className="text-sm text-muted-foreground">
          O resumo fica disponível quando o impacto de longo prazo for aprovado.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8 px-4 py-6 sm:px-6 lg:px-8">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">Resumo da jornada</h2>
          <p className="text-sm text-muted-foreground">
            Tudo o que foi construído e aprovado para o projeto {snapshot.project.name}.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm">
            <Link href={`/projetos/${snapshot.project.id}/resultados`}>
              <ClipboardCheck aria-hidden /> Registrar resultados
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href={`/projetos/${snapshot.project.id}/relatorio`}>
              <FileText aria-hidden /> Ver relatório
            </Link>
          </Button>
        </div>
      </header>
      {VISIBLE_STAGES.map((stage, i) => (
        <section key={stage} aria-labelledby={`resumo-${stage}`} className="space-y-3">
          <h3 id={`resumo-${stage}`} className="text-base font-semibold">
            {i + 1}. {STAGE_LABELS[stage]}
          </h3>
          <StageContent stage={stage} snapshot={snapshot} canEdit={false} onEdit={noop} onDelete={noop} />
        </section>
      ))}
    </div>
  );
}

function StageView({
  stage,
  journey,
  onEdit,
  onDelete,
  onReopen,
}: {
  stage: JourneyStageKey;
  journey: JourneyController;
  onEdit: (target: EditTarget) => void;
  onDelete: (target: DeleteTarget) => void;
  onReopen: (stage: JourneyStageKey) => void;
}) {
  const { snapshot, pendingProposal, conversationState, canEdit } = journey.view;
  const state = stageStates(snapshot.approvedStages)[stage];
  const blockers = state === "current" ? stageApprovalBlockers(snapshot, stage) : [];
  const draft =
    state !== "current"
      ? null
      : conversationState?.kind === "ACTIVITY_DRAFT"
        ? `Atividade em construção: ${conversationState.description}`
        : conversationState?.kind === "IMPACT_FOLLOW_UP_DRAFT"
          ? "Definindo o acompanhamento do impacto após o projeto."
          : null;
  const proposal = state === "current" ? pendingProposal : null;

  return (
    <div className="space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <header className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-semibold">{stageTitle(stage)}</h2>
          {state === "approved" && (
            <span className="rounded-full bg-success-soft px-2 py-0.5 text-[11px] font-medium text-success">
              Aprovada
            </span>
          )}
          {state === "current" && (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
              Em andamento
            </span>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          {state === "approved"
            ? "Síntese aprovada. Alterações substituem a versão atual somente após sua confirmação."
            : state === "pending"
              ? "Esta etapa será liberada após a aprovação das etapas anteriores."
              : stage === "CONTEXT"
                ? "Confira se o público, o território e o problema estão claros. Se estiver tudo certo, aprove a etapa."
                : "Etapa em andamento. Construa o conteúdo na conversa com o consultor."}
        </p>
      </header>

      {(draft || proposal) && (
        <section aria-labelledby="em-construcao" className="space-y-3">
          <h3 id="em-construcao" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Em construção
          </h3>
          {draft && <p className="rounded-lg border border-dashed bg-card p-4 text-sm">{draft}</p>}
          {proposal && (
            <div className="rounded-lg border border-dashed border-primary/40 bg-card p-4">
              <p className="mb-2 text-xs font-semibold text-primary">
                Proposta pendente · {proposalTitle(proposal.type, proposal.payload)}
              </p>
              <ProposalContent type={proposal.type} payload={proposal.payload} snapshot={snapshot} />
            </div>
          )}
        </section>
      )}

      {state !== "pending" && (
        <section className="rounded-xl border bg-card p-5">
          <StageContent stage={stage} snapshot={snapshot} canEdit={canEdit} onEdit={onEdit} onDelete={onDelete} />
        </section>
      )}

      {blockers.length > 0 && (
        <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
          {blockers.map((b) => (
            <li key={b}>{b}</li>
          ))}
        </ul>
      )}

      {canEdit && state !== "pending" && (
        <div className="flex flex-wrap gap-2">
          {state === "approved" && (
            <Button variant="outline" onClick={() => onReopen(stage)}>
              Reabrir etapa
            </Button>
          )}
          {state === "current" && (
            <Button
              disabled={blockers.length > 0 || journey.busy || Boolean(pendingProposal)}
              onClick={() => void journey.changeStage(stage, "approve")}
            >
              Aprovar etapa
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Indicador técnico TEMPORÁRIO, só em desenvolvimento: mostra qual provedor
 * responde (Mock = simulação sem IA; OpenAI = chamadas reais).
 */
function AIModeBadge({ mode }: { mode: "mock" | "external" }) {
  if (process.env.NODE_ENV !== "development") return null;
  return (
    <span
      className={
        mode === "mock"
          ? "rounded border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-800"
          : "rounded border border-emerald-300 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-800"
      }
    >
      Modo IA: {mode === "mock" ? "Mock" : "OpenAI"}
    </span>
  );
}
