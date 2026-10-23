import { describe, expect, it } from "vitest";
import {
  canManageOrganizationMembers,
  canManageOrganizations,
  projectAccess,
  projectScope,
  type AccessUser,
} from "@/lib/auth/permissions";

const base = { name: "Pessoa", email: "p@exemplo.org" };
const member: AccessUser = {
  ...base,
  id: "u1",
  isPlatformAdmin: false,
  memberships: [{ organizationId: "orgA", organizationName: "A", role: "ORGANIZATION_MEMBER" }],
};
const orgAdmin: AccessUser = {
  ...base,
  id: "u2",
  isPlatformAdmin: false,
  memberships: [{ organizationId: "orgA", organizationName: "A", role: "ORGANIZATION_ADMIN" }],
};
const platformAdmin: AccessUser = { ...base, id: "u3", isPlatformAdmin: true, memberships: [] };

describe("acesso a projetos", () => {
  it("membro edita projetos da própria organização", () => {
    expect(projectAccess(member, { organizationId: "orgA" })).toBe("edit");
  });

  it("membro nunca acessa projeto de outra organização", () => {
    expect(projectAccess(member, { organizationId: "orgB" })).toBeNull();
    expect(projectAccess(orgAdmin, { organizationId: "orgB" })).toBeNull();
  });

  it("platform_admin visualiza todas as organizações, sem editar", () => {
    expect(projectAccess(platformAdmin, { organizationId: "orgB" })).toBe("view");
  });

  it("escopo de consulta restringe às organizações da pessoa", () => {
    expect(projectScope(member)).toEqual({ organizationIds: ["orgA"] });
    expect(projectScope(platformAdmin)).toBeNull();
  });

  it("usuário sem organização não tem escopo de projetos", () => {
    const orphan: AccessUser = { ...base, id: "u4", isPlatformAdmin: false, memberships: [] };
    expect(projectScope(orphan)).toEqual({ organizationIds: [] });
  });
});

describe("gestão de membros e organizações", () => {
  it("apenas organization_admin (ou platform_admin) gerencia membros", () => {
    expect(canManageOrganizationMembers(orgAdmin, "orgA")).toBe(true);
    expect(canManageOrganizationMembers(member, "orgA")).toBe(false);
    expect(canManageOrganizationMembers(orgAdmin, "orgB")).toBe(false);
    expect(canManageOrganizationMembers(platformAdmin, "orgB")).toBe(true);
  });

  it("apenas platform_admin cria organizações", () => {
    expect(canManageOrganizations(platformAdmin)).toBe(true);
    expect(canManageOrganizations(orgAdmin)).toBe(false);
  });
});
