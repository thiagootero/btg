import "server-only";
import { notFound, redirect } from "next/navigation";
import type { AccessUser } from "@/lib/auth/permissions";
import { ForbiddenError, NotFoundError } from "@/server/errors";
import { assertProjectAccess } from "@/server/projects";

/** Versão para páginas: converte erros de acesso em 404 ou redirecionamento. */
export async function requireProjectPage(user: AccessUser, projectId: string, required: "view" | "edit") {
  try {
    return await assertProjectAccess(user, projectId, required);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    if (error instanceof ForbiddenError) redirect(`/projetos/${projectId}/jornada`);
    throw error;
  }
}
