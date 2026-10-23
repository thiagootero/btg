import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { PageLoading } from "@/components/layout/page-loading";
import { OrganizationMembers } from "@/components/organization/organization-members";
import { requireUser } from "@/lib/auth/session";
import { listManageableOrganizations } from "@/server/organizations";

export const metadata: Metadata = { title: "Organização" };

export default function OrganizationPage() {
  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight">Organização</h1>
      <p className="mt-1 mb-8 text-sm text-muted-foreground">Gerencie quem tem acesso aos projetos da sua organização.</p>
      <Suspense fallback={<PageLoading />}>
        <Organizations />
      </Suspense>
    </main>
  );
}

async function Organizations() {
  const user = await requireUser();
  if (!user.memberships.some((m) => m.role === "ORGANIZATION_ADMIN")) {
    redirect(user.isPlatformAdmin ? "/admin/organizacoes" : "/projetos");
  }
  const user2 = { ...user, isPlatformAdmin: false };
  const orgs = await listManageableOrganizations(user2);
  return (
    <div className="space-y-6">
      {orgs.map((org) => (
        <OrganizationMembers key={org.id} org={org} currentUserId={user.id} />
      ))}
    </div>
  );
}
