import "server-only";
import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import {
  canEditOrganizationProjects,
  projectAccess,
  projectScope,
  type AccessUser,
  type ProjectAccess,
} from "@/lib/auth/permissions";
import { PROJECT_AREAS, STATE_CODES, type ProjectAreaKey } from "@/lib/journey/areas";
import type { ProjectInput } from "@/lib/validation/project";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/server/errors";

/** Filtro Prisma que restringe projetos às organizações da pessoa. */
export function projectWhereForUser(user: AccessUser): Prisma.ProjectWhereInput {
  const scope = projectScope(user);
  return scope ? { organizationId: { in: scope.organizationIds } } : {};
}

/**
 * Garante que a pessoa pode acessar o projeto no nível pedido. Projetos de
 * outras organizações respondem como "não encontrado" para não vazar sua
 * existência.
 */
export async function assertProjectAccess(
  user: AccessUser,
  projectId: string,
  required: "view" | "edit",
): Promise<{ id: string; organizationId: string; access: Exclude<ProjectAccess, null> }> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, organizationId: true },
  });
  const access = project ? projectAccess(user, project) : null;
  if (!project || !access) throw new NotFoundError("Projeto não encontrado.");
  if (required === "edit" && access !== "edit") {
    throw new ForbiddenError("Seu perfil permite apenas visualizar este projeto.");
  }
  return { ...project, access };
}

export interface ProjectFilters {
  q?: string;
  area?: string;
  state?: string;
  organizationId?: string;
}

export async function listProjects(user: AccessUser, filters: ProjectFilters) {
  const where: Prisma.ProjectWhereInput = { AND: [projectWhereForUser(user)] };
  const and = where.AND as Prisma.ProjectWhereInput[];
  if (filters.q?.trim()) and.push({ name: { contains: filters.q.trim() } });
  if (filters.area && (PROJECT_AREAS as readonly string[]).includes(filters.area)) {
    and.push({ area: filters.area as ProjectAreaKey });
  }
  if (filters.state && (STATE_CODES as readonly string[]).includes(filters.state)) {
    and.push({ territories: { some: { state: filters.state } } });
  }
  if (filters.organizationId) and.push({ organizationId: filters.organizationId });

  return prisma.project.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    take: 200,
    select: {
      id: true,
      name: true,
      area: true,
      areaOther: true,
      durationMonths: true,
      currentStage: true,
      journeyStatus: true,
      isDemo: true,
      updatedAt: true,
      organization: { select: { id: true, name: true } },
      territories: { select: { city: true, state: true }, orderBy: { order: "asc" } },
    },
  });
}

function resolveOrganization(user: AccessUser, requested?: string): string {
  if (requested) {
    if (!canEditOrganizationProjects(user, requested)) {
      throw new ForbiddenError("Você não pode criar projetos nesta organização.");
    }
    return requested;
  }
  if (user.memberships.length === 1) return user.memberships[0].organizationId;
  if (user.memberships.length === 0) {
    throw new ForbiddenError("Seu usuário não está vinculado a nenhuma organização para criar projetos.");
  }
  throw new ValidationError("Selecione a organização do projeto.", { organizationId: ["Selecione a organização."] });
}

function projectData(input: ProjectInput) {
  return {
    name: input.name,
    area: input.area,
    areaOther: input.area === "OUTRA" ? input.areaOther?.trim() || null : null,
    targetAudience: input.targetAudience,
    durationMonths: input.durationMonths,
    problem: input.problem,
  };
}

export async function createProject(user: AccessUser, input: ProjectInput) {
  const organizationId = resolveOrganization(user, input.organizationId);
  return prisma.project.create({
    data: {
      ...projectData(input),
      organizationId,
      createdById: user.id,
      territories: {
        create: input.territories.map((t, order) => ({ city: t.city, state: t.state, order })),
      },
    },
    select: { id: true },
  });
}

/**
 * Atualiza o contexto. Se a etapa de contexto já foi aprovada, a substituição
 * exige confirmação explícita (confirmReplace).
 */
export async function updateProject(user: AccessUser, projectId: string, input: ProjectInput, confirmReplace: boolean) {
  await assertProjectAccess(user, projectId, "edit");
  const approved = await prisma.journeyStageApproval.findUnique({
    where: { projectId_stage: { projectId, stage: "CONTEXT" } },
  });
  if (approved && !confirmReplace) {
    throw new ConflictError("O contexto já foi aprovado. Confirme que deseja substituir a versão aprovada.");
  }
  await prisma.$transaction([
    prisma.projectTerritory.deleteMany({ where: { projectId } }),
    prisma.project.update({
      where: { id: projectId },
      data: {
        ...projectData(input),
        territories: {
          create: input.territories.map((t, order) => ({ city: t.city, state: t.state, order })),
        },
      },
    }),
  ]);
}
