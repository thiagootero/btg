import type { ZodError } from "zod";

/** Converte issues do Zod em { "campo.sub": ["mensagem"] }. */
export function zodFieldErrors(error: ZodError): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.length ? issue.path.join(".") : "_form";
    (result[key] ??= []).push(issue.message);
  }
  return result;
}
