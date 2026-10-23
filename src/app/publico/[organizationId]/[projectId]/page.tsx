import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { ArrowLeft } from "lucide-react";
import { PageLoading } from "@/components/layout/page-loading";
import { formatDatePt, HighlightTile, IndicatorResult, StageBadge } from "@/components/public/result-blocks";
import { publicPath, type PublicResultsView } from "@/lib/results/public";
import { getPublicProject } from "@/server/results/service";

/** Detalhe público de um projeto (sem login), dentro da vitrine da organização. */
export async function generateMetadata({
  params,
}: PageProps<"/publico/[organizationId]/[projectId]">): Promise<Metadata> {
  // Sempre na requisição: a página reflete os registros atuais.
  await connection();
  const { organizationId, projectId } = await params;
  const view = await getPublicProject(organizationId, projectId);
  return {
    title: view ? `Resultados — ${view.project.name}` : "Resultados do projeto",
    description: view
      ? `Resultados alcançados pelo projeto ${view.project.name}, de ${view.organization.name}.`
      : undefined,
    robots: { index: false, follow: false },
  };
}

export default function PublicProjectPage({ params }: PageProps<"/publico/[organizationId]/[projectId]">) {
  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6 sm:py-14 print:max-w-none print:p-0">
      <Suspense fallback={<PageLoading label="Carregando os resultados…" />}>
        <PublicProject params={params} />
      </Suspense>
    </main>
  );
}

async function PublicProject({ params }: { params: PageProps<"/publico/[organizationId]/[projectId]">["params"] }) {
  await connection();
  const { organizationId, projectId } = await params;
  const view = await getPublicProject(organizationId, projectId);
  if (!view) notFound();
  const { project, organization } = view;

  return (
    <article>
      <Link
        href={publicPath(organization.id)}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground print:hidden"
      >
        <ArrowLeft className="size-4" aria-hidden /> Todos os projetos de {organization.name}
      </Link>

      <header className="mt-4 border-b pb-8">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">{organization.name}</p>
          <StageBadge stage={view.stage} />
        </div>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-balance sm:text-4xl">{project.name}</h1>
        <dl className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-sm">
          <Fact label="Área" value={project.areaLabel} />
          <Fact label="Território" value={project.territory} />
          <Fact label="Duração" value={project.duration} />
        </dl>
      </header>

      {view.highlights.length > 0 && (
        <section aria-labelledby="destaques" className="mt-10">
          <h2 id="destaques" className="sr-only">
            Principais resultados
          </h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {view.highlights.map((h) => (
              <li key={`${h.label}-${h.value}`}>
                <HighlightTile highlight={h} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="sobre" className="mt-12">
        <h2 id="sobre" className="text-lg font-semibold">
          Sobre o projeto
        </h2>
        <dl className="mt-4 grid gap-5 text-sm leading-relaxed sm:grid-cols-2">
          <Block label="Problema enfrentado" value={project.problem} />
          <Block label="Público atendido" value={project.targetAudience} />
          {project.impact && (
            <div className="sm:col-span-2">
              <Block label="Mudança de longo prazo buscada" value={project.impact} />
            </div>
          )}
        </dl>
      </section>

      {view.sections.length === 0 ? (
        <p className="mt-12 rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
          {view.stage === "PLANNING"
            ? "O projeto está em planejamento. Os resultados aparecerão aqui à medida que forem registrados."
            : "Os resultados deste projeto ainda estão sendo registrados."}
        </p>
      ) : (
        view.sections.map((section) => <Section key={section.type} section={section} />)
      )}

      <footer className="mt-14 border-t pt-6 text-xs leading-relaxed text-muted-foreground">
        <p>
          {view.completedAt
            ? `Dados e textos técnicos registrados e aprovados por ${organization.name}. Registro finalizado em ${formatDatePt(view.completedAt)}.`
            : `Informações registradas por ${organization.name}. Resultados em registro são parciais e podem mudar até a finalização.`}
        </p>
        <p className="mt-1">Elaborado com a Jornada de Impacto · BTG Soma.</p>
      </footer>
    </article>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="inline text-muted-foreground">{label}: </dt>
      <dd className="inline font-medium">{value || "—"}</dd>
    </div>
  );
}

function Block({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-1">{value}</dd>
    </div>
  );
}

function Section({ section }: { section: PublicResultsView["sections"][number] }) {
  return (
    <section aria-labelledby={`secao-${section.type}`} className="print-avoid-break mt-12">
      <h2 id={`secao-${section.type}`} className="border-b pb-2 text-lg font-semibold">
        {section.title}
      </h2>
      <div className="mt-5 space-y-5">
        {section.items.map((item) => (
          <div key={item.id} className="rounded-xl border bg-card p-5 sm:p-6">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{item.label}</p>
            <h3 className="mt-1 font-semibold leading-snug">{item.item}</h3>
            {item.target && (
              <p className="mt-1 text-sm text-muted-foreground">
                <span className="font-medium">Meta prevista:</span> {item.target}
              </p>
            )}
            {item.indicators.length > 0 && (
              <dl className="mt-4 grid gap-4 rounded-lg bg-muted/50 p-4 sm:grid-cols-2">
                {item.indicators.map((i) => (
                  <IndicatorResult key={i.name} indicator={i} />
                ))}
              </dl>
            )}
            {item.text ? (
              <p className="mt-4 text-sm leading-relaxed whitespace-pre-line">{item.text}</p>
            ) : (
              <p className="mt-4 text-xs italic text-muted-foreground">Texto técnico em elaboração.</p>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
