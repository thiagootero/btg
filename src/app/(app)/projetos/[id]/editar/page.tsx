import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowLeft } from "lucide-react";
import { PageLoading } from "@/components/layout/page-loading";
import { ProjectForm } from "@/components/projects/project-form";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { requireProjectPage } from "@/server/page-guards";
import { loadSnapshot } from "@/server/journey/snapshot";

export const metadata: Metadata = { title: "Editar contexto" };

export default function EditProjectPage({ params }: PageProps<"/projetos/[id]/editar">) {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
      <Suspense fallback={<PageLoading />}>
        <EditProject params={params} />
      </Suspense>
    </main>
  );
}

async function EditProject({ params }: { params: PageProps<"/projetos/[id]/editar">["params"] }) {
  const user = await requireUser();
  const { id } = await params;
  await requireProjectPage(user, id, "edit");
  const snapshot = await loadSnapshot(id);
  const p = snapshot.project;
  const organization = await prisma.organization.findUniqueOrThrow({
    where: { id: p.organizationId },
    select: { id: true, name: true },
  });
  return (
    <>
      <Link
        href={`/projetos/${id}/jornada`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden /> Voltar à jornada
      </Link>
      <h1 className="mt-3 mb-8 text-2xl font-semibold tracking-tight">Contexto do projeto</h1>
      <ProjectForm
        projectId={id}
        organizations={[organization]}
        contextApproved={snapshot.approvedStages.includes("CONTEXT")}
        initial={{
          organizationId: p.organizationId,
          name: p.name,
          area: p.area,
          areaOther: p.areaOther ?? "",
          territories: p.territories,
          targetAudience: p.targetAudience,
          durationMonths: String(p.durationMonths),
          problem: p.problem,
        }}
      />
    </>
  );
}
