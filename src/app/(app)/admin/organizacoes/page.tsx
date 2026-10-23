import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { PageLoading } from "@/components/layout/page-loading";
import { CreateOrganizationForm } from "@/components/organization/member-forms";
import { OrganizationMembers } from "@/components/organization/organization-members";
import { requireUser } from "@/lib/auth/session";
import { listManageableOrganizations } from "@/server/organizations";

export const metadata: Metadata = { title: "Administração" };

export default function AdminOrganizationsPage() {
  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight">Organizações participantes</h1>
      <p className="mt-1 mb-8 text-sm text-muted-foreground">
        Área da equipe gestora da plataforma. Crie organizações e acompanhe quem tem acesso.
      </p>
      <Suspense fallback={<PageLoading />}>
        <AdminContent />
      </Suspense>
    </main>
  );
}

async function AdminContent() {
  const user = await requireUser();
  if (!user.isPlatformAdmin) redirect("/projetos");
  const orgs = await listManageableOrganizations(user);
  return (
    <div className="space-y-8">
      <section className="rounded-xl border bg-card p-5 sm:p-6" aria-labelledby="nova-org">
        <h2 id="nova-org" className="mb-4 text-lg font-semibold">
          Nova organização
        </h2>
        <CreateOrganizationForm />
      </section>
      {orgs.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma organização cadastrada.</p>
      ) : (
        orgs.map((org) => <OrganizationMembers key={org.id} org={org} currentUserId={user.id} />)
      )}
    </div>
  );
}
