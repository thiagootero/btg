"use server";

import { ZodError } from "zod";
import { requireApiUser } from "@/lib/auth/session";
import { projectInputSchema } from "@/lib/validation/project";
import { zodFieldErrors } from "@/lib/validation/zod-errors";
import { AppError } from "@/server/errors";
import { createProject, updateProject } from "@/server/projects";

export type SaveProjectResult =
  | { ok: true; id: string }
  | { ok: false; message: string; fieldErrors?: Record<string, string[]>; code?: string };

/** Cria ou atualiza o contexto do projeto com validação e autorização no servidor. */
export async function saveProjectAction(
  input: unknown,
  projectId?: string,
  confirmReplace = false,
): Promise<SaveProjectResult> {
  try {
    const user = await requireApiUser();
    const data = projectInputSchema.parse(input);
    if (projectId) {
      await updateProject(user, projectId, data, confirmReplace);
      return { ok: true, id: projectId };
    }
    const created = await createProject(user, data);
    return { ok: true, id: created.id };
  } catch (error) {
    if (error instanceof ZodError) {
      return {
        ok: false,
        message: "Revise os campos destacados.",
        fieldErrors: zodFieldErrors(error),
      };
    }
    if (error instanceof AppError) {
      return { ok: false, message: error.message, fieldErrors: error.fieldErrors, code: error.code };
    }
    console.error("[projetos] erro ao salvar", error);
    return { ok: false, message: "Não foi possível salvar agora. Tente novamente em instantes." };
  }
}
