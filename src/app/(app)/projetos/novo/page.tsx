import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowLeft } from "lucide-react";
import { PageLoading } from "@/components/layout/page-loading";
import { ProjectForm } from "@/components/projects/project-form";
import { FormAlert } from "@/components/form/form-alert";
import { requireUser } from "@/lib/auth/session";
import { organizationsForNewProject } from "@/lib/auth/permissions";

export const metadata: Metadata = { title: "Novo projeto" };

export default function NewProjectPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
      <Link href="/projetos" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> Projetos
      </Link>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight">Novo projeto</h1>
      <p className="mt-1 mb-8 text-sm leading-relaxed text-muted-foreground">
        Comece pelo essencial. Em seguida, o consultor virtual ajuda a construir a Jornada de Impacto, uma
        decisão por vez.
      </p>
      <Suspense fallback={<PageLoading />}>
        <NewProjectForm />
      </Suspense>
    </main>
  );
}

async function NewProjectForm() {
  const user = await requireUser();
  const organizations = organizationsForNewProject(user).map((m) => ({ id: m.organizationId, name: m.organizationName }));
  if (organizations.length === 0) {
    return (
      <FormAlert tone="info">
        Seu perfil não está vinculado a uma organização, por isso não pode criar projetos. Perfis de gestão da
        plataforma podem visualizar os projetos de todas as organizações.
      </FormAlert>
    );
  }
  return <ProjectForm organizations={organizations} />;
}
