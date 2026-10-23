import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowLeft, Lock } from "lucide-react";
import { PageLoading } from "@/components/layout/page-loading";
import { ResultsWorkspace } from "@/components/results/results-workspace";
import { requireUser } from "@/lib/auth/session";
import { RESULTS_LOCKED_MESSAGE } from "@/lib/results/status";
import { requireProjectPage } from "@/server/page-guards";
import { getResultsView } from "@/server/results/service";

export const metadata: Metadata = { title: "Resultados do Projeto" };

export default function ResultsPage({ params }: PageProps<"/projetos/[id]/resultados">) {
  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6">
      <Suspense fallback={<PageLoading label="Carregando os resultados…" />}>
        <Results params={params} />
      </Suspense>
    </main>
  );
}

async function Results({ params }: { params: PageProps<"/projetos/[id]/resultados">["params"] }) {
  const user = await requireUser();
  const { id } = await params;
  await requireProjectPage(user, id, "view");
  const view = await getResultsView(user, id);
  return (
    <>
      <Link
        href={`/projetos/${id}/jornada`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden /> Voltar à jornada
      </Link>
      <header className="mt-3 mb-6">
        <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">{view.project.name}</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Resultados do Projeto</h1>
        <p className="mt-1 max-w-3xl text-sm leading-relaxed text-muted-foreground">
          Registre o que foi alcançado ao final do projeto. Os dados informados serão organizados em um texto técnico
          para revisão e futura apresentação dos resultados.
        </p>
      </header>
      {view.unlocked ? (
        <ResultsWorkspace initial={view} />
      ) : (
        <div className="flex items-start gap-3 rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
          <Lock className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p>{RESULTS_LOCKED_MESSAGE}</p>
        </div>
      )}
    </>
  );
}
