import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowLeft } from "lucide-react";
import { PageLoading } from "@/components/layout/page-loading";
import { FinalizeButton } from "@/components/results/finalize-button";
import { requireUser } from "@/lib/auth/session";
import { RESULT_SECTIONS, RESULT_SOURCE_TYPES } from "@/lib/results/items";
import { RESULTS_LOCKED_MESSAGE } from "@/lib/results/status";
import { requireProjectPage } from "@/server/page-guards";
import { getResultsView } from "@/server/results/service";

export const metadata: Metadata = { title: "Avaliação final" };

export default function SynthesisPage({ params }: PageProps<"/projetos/[id]/resultados/sintese">) {
  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6">
      <Suspense fallback={<PageLoading label="Montando a avaliação final…" />}>
        <Synthesis params={params} />
      </Suspense>
    </main>
  );
}

function formatDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

async function Synthesis({ params }: { params: PageProps<"/projetos/[id]/resultados/sintese">["params"] }) {
  const user = await requireUser();
  const { id } = await params;
  await requireProjectPage(user, id, "view");
  const view = await getResultsView(user, id);
  const back = (
    <Link
      href={`/projetos/${id}/resultados`}
      className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="size-4" aria-hidden /> Voltar aos resultados
    </Link>
  );

  if (!view.unlocked || !view.readyForSynthesis) {
    return (
      <>
        {back}
        <p className="mt-6 rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
          {view.unlocked
            ? `A avaliação final fica disponível quando todos os itens de “${RESULT_SECTIONS.OUTCOME.title}” tiverem texto técnico aprovado.`
            : RESULTS_LOCKED_MESSAGE}
        </p>
      </>
    );
  }

  const completedAt = view.evaluation?.status === "COMPLETED" ? view.evaluation.completedAt : null;
  return (
    <article>
      {back}
      <header className="mt-3 mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Avaliação final — {view.project.name}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {view.project.organizationName}
          {completedAt ? ` · Registro finalizado em ${formatDate(completedAt)}` : " · Registro ainda não finalizado"}
        </p>
      </header>

      {RESULT_SOURCE_TYPES.map((type) => {
        // Resultados de médio prazo são obrigatórios; atividades e impacto entram quando têm texto aprovado.
        const cards = view.cards.filter(
          (c) => c.sourceType === type && (type === "OUTCOME" || c.status === "APPROVED"),
        );
        if (cards.length === 0) return null;
        const section = RESULT_SECTIONS[type];
        return (
          <section key={type} aria-labelledby={`registrados-${type}`} className="mb-8 space-y-4">
            <h2 id={`registrados-${type}`} className="text-lg font-semibold">
              {section.number}. {section.title}
            </h2>
            {cards.map((card) => (
              <div key={card.recordId} className="rounded-xl border bg-card p-5">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{card.label}</p>
                <p className="mt-1 font-medium">{card.reference.item}</p>
                <dl className="mt-3 space-y-2 text-sm">
                  {card.indicators.map((i) => (
                    <div key={i.id}>
                      <dt className="inline font-semibold">{i.name}: </dt>
                      <dd className="inline">{i.achievedSummary ?? "Não registrado"}</dd>
                    </div>
                  ))}
                  <div>
                    <dt className="font-semibold">Texto técnico aprovado</dt>
                    <dd className="mt-1 whitespace-pre-line leading-relaxed">{card.approvedText}</dd>
                  </div>
                </dl>
              </div>
            ))}
          </section>
        );
      })}

      {view.canEdit && !completedAt && (
        <section className="mt-8 rounded-xl border bg-card p-5">
          <FinalizeButton projectId={id} />
        </section>
      )}
    </article>
  );
}
