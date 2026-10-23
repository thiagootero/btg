import { z } from "zod";
import { PROJECT_AREAS, STATE_CODES } from "@/lib/journey/areas";
import { detectSensitiveData } from "@/lib/journey/rules";

const noPersonalData = (value: string) => detectSensitiveData(value).length === 0;
const personalDataMessage = "Não inclua dados pessoais (CPF, telefone, e-mail) neste campo.";

const longText = (label: string, min: number, max: number) =>
  z
    .string({ error: `Preencha ${label}.` })
    .trim()
    .min(min, `Descreva ${label} com pelo menos ${min} caracteres.`)
    .max(max, `Use no máximo ${max} caracteres.`)
    .refine(noPersonalData, personalDataMessage);

export const territorySchema = z.object({
  city: z
    .string({ error: "Informe a cidade." })
    .trim()
    .min(2, "Informe a cidade.")
    .max(100, "Nome de cidade muito longo."),
  state: z.enum(STATE_CODES, { error: "Selecione a UF." }),
});

export const projectInputSchema = z
  .object({
    organizationId: z.string().trim().min(1).optional(),
    name: z
      .string({ error: "Informe o nome do projeto." })
      .trim()
      .min(3, "O nome deve ter pelo menos 3 caracteres.")
      .max(150, "Use no máximo 150 caracteres."),
    area: z.enum(PROJECT_AREAS, { error: "Selecione a área do projeto." }),
    areaOther: z.string().trim().max(120, "Use no máximo 120 caracteres.").nullish(),
    territories: z
      .array(territorySchema)
      .min(1, "Informe pelo menos uma cidade e UF.")
      .max(50, "Use no máximo 50 territórios."),
    targetAudience: longText("o público-alvo", 10, 2000),
    durationMonths: z.coerce
      .number({ error: "Informe a duração em meses." })
      .int("Use um número inteiro de meses.")
      .min(1, "A duração mínima é 1 mês.")
      .max(120, "A duração máxima é 120 meses."),
    problem: longText("o problema enfrentado", 20, 4000),
  })
  .superRefine((value, ctx) => {
    if (value.area === "OUTRA" && !value.areaOther?.trim()) {
      ctx.addIssue({ code: "custom", path: ["areaOther"], message: "Descreva a área do projeto." });
    }
    const seen = new Set<string>();
    value.territories.forEach((t, i) => {
      const key = `${t.city.toLowerCase()}|${t.state}`;
      if (seen.has(key)) {
        ctx.addIssue({ code: "custom", path: ["territories", i, "city"], message: "Território repetido." });
      }
      seen.add(key);
    });
  });

export type ProjectInput = z.infer<typeof projectInputSchema>;
