import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowLeft, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageLoading } from "@/components/layout/page-loading";
import { EvidencePlanEditor } from "@/components/evidence/evidence-plan-editor";
import { requireUser } from "@/lib/auth/session";
import { buildViewState } from "@/server/journey/conversation";
import { requireProjectPage } from "@/server/page-guards";

export const metadata: Metadata = { title: "Plano de evidências" };

export default function EvidencePlanPage({ params }: PageProps<"/projetos/[id]/plano-de-evidencias">) {
  return (
    <main className="mx-auto w-full max-w-[1400px] px-4 py-8 sm:px-6">
      <Suspense fallback={<PageLoading label="Carregando o plano…" />}>
        <EvidencePlan params={params} />
      </Suspense>
    </main>
  );
}

async function EvidencePlan({ params }: { params: PageProps<"/projetos/[id]/plano-de-evidencias">["params"] }) {
  const user = await requireUser();
  const { id } = await params;
  const { access } = await requireProjectPage(user, id, "view");
  const view = await buildViewState(id, access === "edit");
  return (
    <>
      <Link href={`/projetos/${id}/jornada`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> Voltar à jornada
      </Link>
      <div className="mt-3 mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Plano de evidências</h1>
          <p className="mt-1 max-w-3xl text-sm leading-relaxed text-muted-foreground">
            {view.snapshot.project.name}. O plano consolida as metas, indicadores e meios de verificação aprovados e
            detalha como cada evidência será coletada. Campos marcados como “a definir” ainda precisam de decisão.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href={`/projetos/${id}/relatorio`}>
            <FileText aria-hidden /> Relatório geral
          </Link>
        </Button>
      </div>
      <EvidencePlanEditor initial={view} canReconsolidate={view.snapshot.approvedStages.includes("IMPACT")} />
    </>
  );
}
