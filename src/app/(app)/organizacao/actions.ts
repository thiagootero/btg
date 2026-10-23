"use server";

import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { requireApiUser } from "@/lib/auth/session";
import { newMemberSchema, newOrganizationSchema } from "@/lib/validation/members";
import { zodFieldErrors } from "@/lib/validation/zod-errors";
import { AppError } from "@/server/errors";
import { addOrganizationMember, createOrganization, removeOrganizationMember } from "@/server/organizations";

export type ActionResult = { ok: true; message: string } | { ok: false; message: string; fieldErrors?: Record<string, string[]> };

function toResult(error: unknown): ActionResult {
  if (error instanceof ZodError) return { ok: false, message: "Revise os campos destacados.", fieldErrors: zodFieldErrors(error) };
  if (error instanceof AppError) return { ok: false, message: error.message, fieldErrors: error.fieldErrors };
  console.error("[organizacao] erro inesperado", error);
  return { ok: false, message: "Não foi possível concluir agora. Tente novamente." };
}

export async function addMemberAction(organizationId: string, input: unknown): Promise<ActionResult> {
  try {
    const user = await requireApiUser();
    const data = newMemberSchema.parse(input);
    const result = await addOrganizationMember(user, organizationId, data);
    revalidatePath("/organizacao");
    return {
      ok: true,
      message: result.created
        ? "Conta criada. Compartilhe a senha provisória por um canal seguro."
        : "Pessoa vinculada à organização com a conta que ela já possui.",
    };
  } catch (error) {
    return toResult(error);
  }
}

export async function removeMemberAction(organizationId: string, memberId: string): Promise<ActionResult> {
  try {
    const user = await requireApiUser();
    await removeOrganizationMember(user, organizationId, memberId);
    revalidatePath("/organizacao");
    return { ok: true, message: "Acesso removido." };
  } catch (error) {
    return toResult(error);
  }
}

export async function createOrganizationAction(input: unknown): Promise<ActionResult> {
  try {
    const user = await requireApiUser();
    const data = newOrganizationSchema.parse(input);
    await createOrganization(user, data);
    revalidatePath("/admin/organizacoes");
    return { ok: true, message: "Organização criada com a primeira pessoa administradora." };
  } catch (error) {
    return toResult(error);
  }
}
