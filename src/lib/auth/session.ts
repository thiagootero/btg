import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db";
import type { AccessUser } from "@/lib/auth/permissions";
import { UnauthorizedError } from "@/server/errors";

/** Lê a sessão do Better Auth e carrega papéis e organizações da pessoa. */
export const getSessionUser = cache(async (): Promise<AccessUser | null> => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      name: true,
      email: true,
      platformRole: true,
      memberships: {
        select: {
          organizationId: true,
          role: true,
          organization: { select: { name: true } },
        },
        orderBy: { organization: { name: "asc" } },
      },
    },
  });
  if (!user) return null;

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    isPlatformAdmin: user.platformRole === "PLATFORM_ADMIN",
    memberships: user.memberships.map((m) => ({
      organizationId: m.organizationId,
      organizationName: m.organization.name,
      role: m.role,
    })),
  };
});

/** Para páginas: redireciona ao login quando não há sessão. */
export async function requireUser(): Promise<AccessUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}

/** Para rotas de API e server actions: lança 401 quando não há sessão. */
export async function requireApiUser(): Promise<AccessUser> {
  const user = await getSessionUser();
  if (!user) throw new UnauthorizedError();
  return user;
}
