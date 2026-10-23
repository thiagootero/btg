/**
 * Regras de autorização (funções puras, testáveis sem banco).
 *
 * Perfis:
 * - platform_admin: visualiza todas as organizações e projetos (somente leitura,
 *   a menos que também seja membro da organização).
 * - organization_admin: administra a própria organização e seus projetos.
 * - organization_member: cria e edita projetos da própria organização.
 */

export type OrganizationRole = "ORGANIZATION_ADMIN" | "ORGANIZATION_MEMBER";

export interface Membership {
  organizationId: string;
  organizationName: string;
  role: OrganizationRole;
}

export interface AccessUser {
  id: string;
  name: string;
  email: string;
  isPlatformAdmin: boolean;
  memberships: Membership[];
}

export type ProjectAccess = "edit" | "view" | null;

export function membershipFor(user: AccessUser, organizationId: string): Membership | undefined {
  return user.memberships.find((m) => m.organizationId === organizationId);
}

export function canViewOrganization(user: AccessUser, organizationId: string): boolean {
  return user.isPlatformAdmin || Boolean(membershipFor(user, organizationId));
}

/** Membros (admin ou não) podem criar e editar projetos da própria organização. */
export function canEditOrganizationProjects(user: AccessUser, organizationId: string): boolean {
  return Boolean(membershipFor(user, organizationId));
}

export function canManageOrganizationMembers(user: AccessUser, organizationId: string): boolean {
  return user.isPlatformAdmin || membershipFor(user, organizationId)?.role === "ORGANIZATION_ADMIN";
}

export function canManageOrganizations(user: AccessUser): boolean {
  return user.isPlatformAdmin;
}

export function projectAccess(user: AccessUser, project: { organizationId: string }): ProjectAccess {
  if (canEditOrganizationProjects(user, project.organizationId)) return "edit";
  if (user.isPlatformAdmin) return "view";
  return null;
}

/** Organizações em que a pessoa pode criar projetos. */
export function organizationsForNewProject(user: AccessUser): Membership[] {
  return user.memberships;
}

/**
 * Filtro de escopo para consultas de projetos. `null` significa "sem restrição"
 * (apenas platform_admin). Para os demais, a lista de organizações permitidas.
 */
export function projectScope(user: AccessUser): { organizationIds: string[] } | null {
  if (user.isPlatformAdmin) return null;
  return { organizationIds: user.memberships.map((m) => m.organizationId) };
}
