import { z } from "zod";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "@/lib/auth/password-policy";

export const passwordSchema = z
  .string({ error: "Informe uma senha." })
  .min(PASSWORD_MIN_LENGTH, `A senha deve ter pelo menos ${PASSWORD_MIN_LENGTH} caracteres.`)
  .max(PASSWORD_MAX_LENGTH, `A senha deve ter no máximo ${PASSWORD_MAX_LENGTH} caracteres.`);

export const newMemberSchema = z.object({
  name: z.string({ error: "Informe o nome." }).trim().min(2, "Informe o nome.").max(120),
  email: z.email({ error: "Informe um e-mail válido." }).trim().max(190),
  /** Senha provisória; obrigatória apenas para quem ainda não tem conta. */
  password: passwordSchema.or(z.literal("")).optional(),
  role: z.enum(["ORGANIZATION_ADMIN", "ORGANIZATION_MEMBER"], { error: "Selecione o perfil." }),
});
export type NewMemberInput = z.infer<typeof newMemberSchema>;

export const newOrganizationSchema = z.object({
  name: z.string({ error: "Informe o nome da organização." }).trim().min(3, "Informe o nome da organização.").max(190),
  adminName: z.string().trim().min(2, "Informe o nome da pessoa administradora.").max(120),
  adminEmail: z.email({ error: "Informe um e-mail válido." }).trim().max(190),
  adminPassword: passwordSchema.or(z.literal("")).optional(),
});
export type NewOrganizationInput = z.infer<typeof newOrganizationSchema>;
