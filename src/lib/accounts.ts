/**
 * Criação de contas com e-mail e senha no formato do Better Auth.
 *
 * O hash da senha usa a função oficial da biblioteca (better-auth/crypto);
 * nenhum algoritmo de criptografia é implementado aqui. Este módulo não
 * importa "server-only" para poder ser usado também pelos scripts de seed.
 */
import { hashPassword } from "better-auth/crypto";
import { generateId } from "better-auth";
import type { PrismaClient } from "@/generated/prisma/client";
import type { OrganizationRole } from "@/lib/auth/permissions";

type Db = Pick<PrismaClient, "user" | "account" | "organizationMember">;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function createPasswordUser(
  db: Db,
  input: { name: string; email: string; password: string; platformAdmin?: boolean },
) {
  const email = normalizeEmail(input.email);
  const userId = generateId();
  const user = await db.user.create({
    data: {
      id: userId,
      name: input.name.trim(),
      email,
      emailVerified: true,
      platformRole: input.platformAdmin ? "PLATFORM_ADMIN" : null,
    },
  });
  await db.account.create({
    data: {
      id: generateId(),
      accountId: userId,
      providerId: "credential",
      userId,
      password: await hashPassword(input.password),
    },
  });
  return user;
}

export async function addMembership(db: Db, userId: string, organizationId: string, role: OrganizationRole) {
  return db.organizationMember.upsert({
    where: { userId_organizationId: { userId, organizationId } },
    create: { userId, organizationId, role },
    update: { role },
  });
}
