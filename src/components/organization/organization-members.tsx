import { Badge } from "@/components/ui/badge";
import { AddMemberForm, RemoveMemberButton } from "@/components/organization/member-forms";

interface OrganizationWithMembers {
  id: string;
  name: string;
  isDemo: boolean;
  _count: { projects: number };
  members: { id: string; role: "ORGANIZATION_ADMIN" | "ORGANIZATION_MEMBER"; user: { id: string; name: string; email: string } }[];
}

export function OrganizationMembers({ org, currentUserId }: { org: OrganizationWithMembers; currentUserId: string }) {
  return (
    <section className="rounded-xl border bg-card p-5 sm:p-6" aria-labelledby={`org-${org.id}`}>
      <div className="flex flex-wrap items-center gap-2">
        <h2 id={`org-${org.id}`} className="text-lg font-semibold">
          {org.name}
        </h2>
        {org.isDemo && <Badge variant="outline">Demonstração</Badge>}
        <span className="text-sm text-muted-foreground">· {org._count.projects} projeto(s)</span>
      </div>
      <h3 className="mt-6 text-sm font-semibold">Pessoas com acesso</h3>
      <ul className="mt-2 divide-y rounded-lg border">
        {org.members.map((m) => (
          <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5">
            <div className="min-w-0">
              <p className="text-sm font-medium">{m.user.name}</p>
              <p className="truncate text-xs text-muted-foreground">{m.user.email}</p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={m.role === "ORGANIZATION_ADMIN" ? "default" : "secondary"}>
                {m.role === "ORGANIZATION_ADMIN" ? "Administrador" : "Membro"}
              </Badge>
              {m.user.id !== currentUserId && <RemoveMemberButton organizationId={org.id} memberId={m.id} name={m.user.name} />}
            </div>
          </li>
        ))}
      </ul>
      <details className="mt-6">
        <summary className="cursor-pointer text-sm font-medium text-primary">Acrescentar pessoa</summary>
        <div className="mt-4">
          <AddMemberForm organizationId={org.id} />
        </div>
      </details>
    </section>
  );
}
