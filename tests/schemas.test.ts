import { describe, expect, it } from "vitest";
import { journeyAIResponseSchema } from "@/lib/journey-ai/response-schema";
import { journeyInputSchema, activityEditSchema, stageChangeSchema } from "@/lib/journey/api-schemas";
import {
  activityPayloadSchema,
  impactPayloadSchema,
  outcomePayloadSchema,
  parseProposalPayload,
} from "@/lib/journey/proposal-schemas";
import { projectInputSchema } from "@/lib/validation/project";

const validActivity = {
  description: "Realizar oficinas de leitura",
  target: { description: "10 oficinas com 30 crianças", deadline: "", quantity: 10, unit: "oficinas" },
  indicators: [{ name: "Número de oficinas realizadas", explanation: "" }],
  evidences: [{ description: "Lista de presença" }],
};

describe("contrato de resposta da IA", () => {
  it("aceita a resposta mínima do contrato", () => {
    const parsed = journeyAIResponseSchema.parse({
      message: "Qual é a primeira atividade?",
      currentStage: "ACTIVITIES",
      actions: [],
      requiresApproval: false,
    });
    expect(parsed.currentStage).toBe("ACTIVITIES");
  });

  it("recusa etapa, intenção de ação ou campos inválidos", () => {
    expect(
      journeyAIResponseSchema.safeParse({ message: "x", currentStage: "FINAL", actions: [], requiresApproval: false }).success,
    ).toBe(false);
    expect(
      journeyAIResponseSchema.safeParse({
        message: "x",
        currentStage: "IMPACT",
        actions: [{ id: "a", label: "A", intent: "DELETE_EVERYTHING" }],
        requiresApproval: false,
      }).success,
    ).toBe(false);
    expect(journeyAIResponseSchema.safeParse({ message: "", currentStage: "IMPACT", actions: [] }).success).toBe(false);
  });

  it("aceita proposta tipada e estado transitório", () => {
    const parsed = journeyAIResponseSchema.parse({
      message: "Ficha pronta",
      currentStage: "ACTIVITIES",
      proposal: { type: "ACTIVITY", payload: validActivity },
      actions: [{ id: "approve-proposal", label: "Aprovar", intent: "APPROVE" }],
      requiresApproval: true,
      state: null,
    });
    expect(parsed.proposal?.type).toBe("ACTIVITY");
  });
});

describe("schemas das propostas", () => {
  it("normaliza campos vazios como 'a definir' (null)", () => {
    const parsed = activityPayloadSchema.parse(validActivity);
    expect(parsed.target.deadline).toBeNull();
    expect(parsed.indicators[0].explanation).toBeNull();
  });

  it("exige indicador e meio de verificação na ficha da atividade", () => {
    expect(activityPayloadSchema.safeParse({ ...validActivity, indicators: [] }).success).toBe(false);
    expect(activityPayloadSchema.safeParse({ ...validActivity, evidences: [] }).success).toBe(false);
  });

  it("valida as três fases das mudanças esperadas", () => {
    expect(
      outcomePayloadSchema.safeParse({
        step: "STATEMENTS",
        outcomes: [{ statement: "as famílias ampliem a produção", relatedActivityIds: ["a1"] }],
      }).success,
    ).toBe(true);
    expect(outcomePayloadSchema.safeParse({ step: "TARGET", outcomeId: "o1", target: "" }).success).toBe(false);
    expect(
      outcomePayloadSchema.safeParse({
        step: "INDICATOR",
        outcomeId: "o1",
        indicators: [{ name: "Percentual de famílias" }],
        verification: "Relatório de evolução das famílias",
      }).success,
    ).toBe(true);
  });

  it("exige acompanhamento quando a opção não é apenas visão", () => {
    expect(impactPayloadSchema.safeParse({ step: "FOLLOW_UP", option: "FOLLOW_UP_CHANGE", followUps: [] }).success).toBe(false);
    expect(impactPayloadSchema.safeParse({ step: "FOLLOW_UP", option: "VISION_ONLY", followUps: [] }).success).toBe(true);
  });

  it("parseProposalPayload valida pelo tipo informado", () => {
    expect(() => parseProposalPayload("ACTIVITY", { step: "STATEMENT", statement: "x" })).toThrow();
  });
});

describe("entradas das rotas", () => {
  it("valida mensagens e ações do chat", () => {
    expect(journeyInputSchema.safeParse({ type: "message", text: "  " }).success).toBe(false);
    expect(journeyInputSchema.safeParse({ type: "message", text: "x".repeat(4001) }).success).toBe(false);
    expect(journeyInputSchema.safeParse({ type: "action", actionId: "add-activity" }).success).toBe(true);
    expect(journeyInputSchema.safeParse({ type: "hack" }).success).toBe(false);
  });

  it("editar conteúdo aprovado exige confirmação explícita", () => {
    expect(activityEditSchema.safeParse(validActivity).success).toBe(false);
    expect(activityEditSchema.safeParse({ ...validActivity, confirmReplace: true }).success).toBe(true);
  });

  it("valida mudança de etapa", () => {
    expect(stageChangeSchema.safeParse({ stage: "OUTCOMES", action: "reopen", confirm: true }).success).toBe(true);
    expect(stageChangeSchema.safeParse({ stage: "OUTCOMES", action: "delete" }).success).toBe(false);
  });
});

describe("cadastro do projeto", () => {
  const valid = {
    name: "Sertão Verde",
    area: "INCLUSAO_PRODUTIVA",
    territories: [{ city: "Ninheira", state: "MG" }],
    targetAudience: "Famílias agricultoras da zona rural",
    durationMonths: "12",
    problem: "Baixa produção de alimentos e poucos canais de venda.",
  };

  it("aceita o cadastro mínimo e converte a duração", () => {
    const parsed = projectInputSchema.parse(valid);
    expect(parsed.durationMonths).toBe(12);
  });

  it("exige descrição quando a área é 'Outra'", () => {
    expect(projectInputSchema.safeParse({ ...valid, area: "OUTRA" }).success).toBe(false);
    expect(projectInputSchema.safeParse({ ...valid, area: "OUTRA", areaOther: "Saúde" }).success).toBe(true);
  });

  it("exige ao menos um território com UF válida e sem repetição", () => {
    expect(projectInputSchema.safeParse({ ...valid, territories: [] }).success).toBe(false);
    expect(projectInputSchema.safeParse({ ...valid, territories: [{ city: "Ninheira", state: "XX" }] }).success).toBe(false);
    expect(
      projectInputSchema.safeParse({
        ...valid,
        territories: [
          { city: "Ninheira", state: "MG" },
          { city: "ninheira", state: "MG" },
        ],
      }).success,
    ).toBe(false);
  });

  it("recusa dados pessoais nos textos", () => {
    expect(projectInputSchema.safeParse({ ...valid, targetAudience: "Família da Maria, CPF 123.456.789-00" }).success).toBe(false);
  });
});
