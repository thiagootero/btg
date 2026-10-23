import Link from "next/link";
import { Suspense } from "react";
import { BrandMark, BrandName } from "@/components/layout/brand";
import { SignOutButton } from "@/components/layout/sign-out-button";
import { getSessionUser } from "@/lib/auth/session";

export function AppHeader() {
  return (
    <header className="no-print sticky top-0 z-30 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="mx-auto flex h-14 max-w-[1440px] items-center gap-4 px-4 sm:px-6">
        <Link href="/projetos" className="flex items-center gap-2.5 rounded-md">
          <BrandMark />
          <BrandName />
        </Link>
        <Suspense fallback={<div className="ml-auto h-8 w-40 animate-pulse rounded-md bg-muted" />}>
          <UserNav />
        </Suspense>
      </div>
    </header>
  );
}

async function UserNav() {
  const user = await getSessionUser();
  if (!user) return null;
  const isOrgAdmin = user.memberships.some((m) => m.role === "ORGANIZATION_ADMIN");
  const links = [
    { href: "/projetos", label: "Projetos", show: true },
    { href: "/organizacao", label: "Organização", show: isOrgAdmin },
    { href: "/admin/organizacoes", label: "Administração", show: user.isPlatformAdmin },
  ].filter((l) => l.show);

  return (
    <>
      <nav aria-label="Navegação principal" className="ml-4 hidden items-center gap-1 md:flex">
        {links.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className="rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            {l.label}
          </Link>
        ))}
      </nav>
      <div className="ml-auto flex items-center gap-2">
        <div className="hidden text-right sm:block">
          <p className="text-sm font-medium leading-tight">{user.name}</p>
          <p className="text-xs leading-tight text-muted-foreground">
            {user.isPlatformAdmin ? "Gestão da plataforma" : user.memberships[0]?.organizationName}
          </p>
        </div>
        <SignOutButton />
      </div>
      <nav aria-label="Navegação principal (celular)" className="fixed inset-x-0 bottom-0 z-30 flex border-t bg-background md:hidden">
        {links.map((l) => (
          <Link key={l.href} href={l.href} className="flex-1 py-3 text-center text-sm text-muted-foreground">
            {l.label}
          </Link>
        ))}
      </nav>
    </>
  );
}
