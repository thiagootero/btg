import "server-only";
import { prisma } from "@/lib/db";
import { addMembership, createPasswordUser, normalizeEmail } from "@/lib/accounts";
import { canManageOrganizationMembers, canManageOrganizations, type AccessUser } from "@/lib/auth/permissions";
import type { NewMemberInput, NewOrganizationInput } from "@/lib/validation/members";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/server/errors";

export async function listManageableOrganizations(user: AccessUser) {
  const ids = user.memberships.filter((m) => m.role === "ORGANIZATION_ADMIN").map((m) => m.organizationId);
  return prisma.organization.findMany({
    where: user.isPlatformAdmin ? {} : { id: { in: ids } },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      isDemo: true,
      _count: { select: { projects: true } },
      members: {
        orderBy: { createdAt: "asc" },
        select: { id: true, role: true, user: { select: { id: true, name: true, email: true } } },
      },
    },
  });
}

/** Cria a conta (se ainda não existir) e vincula à organização. */
async function ensureUserInOrganization(
  organizationId: string,
  input: { name: string; email: string; password?: string },
  role: NewMemberInput["role"],
) {
  const email = normalizeEmail(input.email);
  return prisma.$transaction(async (tx) => {
    const existing = await tx.user.findUnique({ where: { email } });
    if (existing) {
      const already = await tx.organizationMember.findUnique({
        where: { userId_organizationId: { userId: existing.id, organizationId } },
      });
      if (already) throw new ConflictError("Esta pessoa já faz parte da organização.");
      await addMembership(tx, existing.id, organizationId, role);
      return { created: false };
    }
    if (!input.password) {
      throw new ValidationError("Defina uma senha provisória para a nova conta.", {
        password: ["Defina uma senha provisória para a nova conta."],
      });
    }
    const user = await createPasswordUser(tx, { name: input.name, email, password: input.password });
    await addMembership(tx, user.id, organizationId, role);
    return { created: true };
  });
}

export async function addOrganizationMember(user: AccessUser, organizationId: string, input: NewMemberInput) {
  if (!canManageOrganizationMembers(user, organizationId)) throw new ForbiddenError();
  const org = await prisma.organization.findUnique({ where: { id: organizationId }, select: { id: true } });
  if (!org) throw new NotFoundError("Organização não encontrada.");
  return ensureUserInOrganization(organizationId, input, input.role);
}

export async function removeOrganizationMember(user: AccessUser, organizationId: string, memberId: string) {
  if (!canManageOrganizationMembers(user, organizationId)) throw new ForbiddenError();
  const member = await prisma.organizationMember.findFirst({ where: { id: memberId, organizationId } });
  if (!member) throw new NotFoundError("Membro não encontrado.");
  if (member.userId === user.id) throw new ValidationError("Você não pode remover o próprio acesso.");
  if (member.role === "ORGANIZATION_ADMIN") {
    const admins = await prisma.organizationMember.count({ where: { organizationId, role: "ORGANIZATION_ADMIN" } });
    if (admins <= 1) throw new ValidationError("A organização precisa de pelo menos uma pessoa administradora.");
  }
  await prisma.organizationMember.delete({ where: { id: member.id } });
}

export async function createOrganization(user: AccessUser, input: NewOrganizationInput) {
  if (!canManageOrganizations(user)) throw new ForbiddenError();
  const org = await prisma.organization.create({ data: { name: input.name }, select: { id: true } });
  try {
    await ensureUserInOrganization(
      org.id,
      { name: input.adminName, email: input.adminEmail, password: input.adminPassword || undefined },
      "ORGANIZATION_ADMIN",
    );
  } catch (error) {
    await prisma.organization.delete({ where: { id: org.id } });
    throw error;
  }
  return org;
}
