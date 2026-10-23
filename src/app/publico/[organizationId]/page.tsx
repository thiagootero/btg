import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { ArrowRight, MapPin, Target, Timer } from "lucide-react";
import { PageLoading } from "@/components/layout/page-loading";
import { HighlightTile, StageBadge } from "@/components/public/result-blocks";
import { publicPath, type PublicOrganizationView } from "@/lib/results/public";
import { getPublicOrganization } from "@/server/results/service";

/**
 * Vitrine pública da organização (sem login): todos os projetos, o impacto que
 * buscam e os resultados já registrados. Protótipo: aberta por link, não indexada.
 */
export async function generateMetadata({ params }: PageProps<"/publico/[organizationId]">): Promise<Metadata> {
  // Sempre na requisição: a página reflete os registros atuais.
  await connection();
  const { organizationId } = await params;
  const view = await getPublicOrganization(organizationId);
  return {
    title: view ? `Impacto — ${view.organization.name}` : "Página pública",
    description: view ? `Projetos de ${view.organization.name} e os resultados alcançados.` : undefined,
    robots: { index: false, follow: false },
  };
}

export default function PublicOrganizationPage({ params }: PageProps<"/publico/[organizationId]">) {
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6 sm:py-14">
      <Suspense fallback={<PageLoading label="Carregando os projetos…" />}>
        <Organization params={params} />
      </Suspense>
    </main>
  );
}

async function Organization({ params }: { params: PageProps<"/publico/[organizationId]">["params"] }) {
  await connection();
  const { organizationId } = await params;
  const view = await getPublicOrganization(organizationId);
  if (!view) notFound();
  const withResults = view.projects.filter((p) => p.itemsWithResults > 0).length;

  return (
    <article>
      <header className="border-b pb-8">
        <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Projetos e impacto</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
          {view.organization.name}
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          {view.projects.length === 0
            ? "A organização ainda não cadastrou projetos."
            : `${view.projects.length} ${view.projects.length === 1 ? "projeto" : "projetos"}, ${withResults} com resultados registrados. Conheça a mudança que cada um busca e o que já foi alcançado.`}
        </p>
      </header>

      <ul className="mt-10 space-y-6" aria-label="Projetos">
        {view.projects.map((p) => (
          <ProjectSummary key={p.project.id} organizationId={view.organization.id} summary={p} />
        ))}
      </ul>

      <footer className="mt-14 border-t pt-6 text-xs leading-relaxed text-muted-foreground">
        <p>
          Informações registradas por {view.organization.name}. Resultados em registro são parciais e podem mudar até a
          finalização.
        </p>
        <p className="mt-1">Elaborado com a Jornada de Impacto · BTG Soma.</p>
      </footer>
    </article>
  );
}

function ProjectSummary({
  organizationId,
  summary,
}: {
  organizationId: string;
  summary: PublicOrganizationView["projects"][number];
}) {
  const { project, stage, highlights, itemsWithResults } = summary;
  return (
    <li className="rounded-2xl border bg-card p-5 sm:p-6">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{project.areaLabel}</span>
        <StageBadge stage={stage} />
      </div>
      <h2 className="mt-2 text-xl font-semibold leading-snug">
        <Link href={publicPath(organizationId, project.id)} className="hover:text-primary hover:underline">
          {project.name}
        </Link>
      </h2>
      <dl className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <dt className="sr-only">Território</dt>
          <MapPin className="size-4 shrink-0" aria-hidden />
          <dd>{project.territory || "—"}</dd>
        </div>
        <div className="flex items-center gap-1.5">
          <dt className="sr-only">Duração</dt>
          <Timer className="size-4 shrink-0" aria-hidden />
          <dd>{project.duration}</dd>
        </div>
      </dl>

      {project.impact && (
        <div className="mt-4 flex gap-2.5 rounded-lg bg-muted/50 p-4">
          <Target className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
          <p className="text-sm leading-relaxed">
            <span className="font-medium">Impacto buscado: </span>
            {project.impact}
          </p>
        </div>
      )}

      {highlights.length > 0 ? (
        <ul className="mt-4 grid gap-3 sm:grid-cols-3" aria-label={`Destaques de ${project.name}`}>
          {highlights.map((h) => (
            <li key={`${h.label}-${h.value}`}>
              <HighlightTile highlight={h} compact />
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-sm text-muted-foreground">
          {stage === "PLANNING" ? "Projeto em planejamento." : "Os resultados ainda estão sendo registrados."}
        </p>
      )}

      <div className="mt-5">
        <Link
          href={publicPath(organizationId, project.id)}
          className="inline-flex items-center gap-1 text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          {itemsWithResults > 0 ? "Ver todos os resultados" : "Conhecer o projeto"}
          <ArrowRight className="size-4" aria-hidden />
        </Link>
      </div>
    </li>
  );
}
