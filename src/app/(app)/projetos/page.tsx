import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageLoading } from "@/components/layout/page-loading";
import { ProjectFiltersForm } from "@/components/projects/project-filters";
import { ProjectCard } from "@/components/projects/project-card";
import { EmptyProjects } from "@/components/projects/empty-projects";
import { requireUser } from "@/lib/auth/session";
import { PublicLinkActions } from "@/components/results/public-link-actions";
import { publicPath } from "@/lib/results/public";
import { listProjects } from "@/server/projects";
import { prisma } from "@/lib/db";

export const metadata: Metadata = { title: "Projetos" };

export default function ProjectsPage({ searchParams }: PageProps<"/projetos">) {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <Suspense fallback={<PageLoading label="Carregando projetos…" />}>
        <ProjectsContent searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

function param(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}

async function ProjectsContent({ searchParams }: { searchParams: PageProps<"/projetos">["searchParams"] }) {
  const user = await requireUser();
  const sp = await searchParams;
  const filters = {
    q: param(sp.q),
    area: param(sp.area),
    state: param(sp.uf),
    organizationId: user.isPlatformAdmin ? param(sp.org) : undefined,
  };
  const projects = await listProjects(user, filters);
  const hasFilters = Boolean(filters.q || filters.area || filters.state || filters.organizationId);
  const canCreate = user.memberships.length > 0;

  const organizations: [string, string][] = user.isPlatformAdmin
    ? (await prisma.organization.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } })).map(
        (o) => [o.id, o.name],
      )
    : [];

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Projetos</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {user.isPlatformAdmin
              ? "Projetos de todas as organizações participantes."
              : `Projetos de ${user.memberships.map((m) => m.organizationName).join(", ")}.`}
          </p>
        </div>
        {user.memberships.map((m) => (
          <PublicLinkActions
            key={m.organizationId}
            path={publicPath(m.organizationId)}
            label={
              user.memberships.length > 1 ? `Página pública · ${m.organizationName}` : "Página pública da organização"
            }
          />
        ))}
        {canCreate && (
          <Button asChild size="lg">
            <Link href="/projetos/novo">
              <Plus aria-hidden />
              Novo projeto
            </Link>
          </Button>
        )}
      </div>

      {(projects.length > 0 || hasFilters) && (
        <ProjectFiltersForm
          defaults={{ q: filters.q ?? "", area: filters.area ?? "", uf: filters.state ?? "", org: filters.organizationId ?? "" }}
          organizations={organizations}
        />
      )}

      {projects.length === 0 ? (
        hasFilters ? (
          <p className="mt-10 rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
            Nenhum projeto encontrado com esses filtros.{" "}
            <Link href="/projetos" className="font-medium text-primary underline-offset-4 hover:underline">
              Limpar filtros
            </Link>
          </p>
        ) : (
          <EmptyProjects canCreate={canCreate} />
        )
      ) : (
        <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-label="Lista de projetos">
          {projects.map((p) => (
            <li key={p.id}>
              <ProjectCard project={p} showOrganization={user.isPlatformAdmin || user.memberships.length > 1} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
