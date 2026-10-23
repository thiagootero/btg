import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MockJourneyAIProvider } from "@/lib/journey-ai/mock-provider";
import { suggestOutcomes, formulateActivity, extractQuantity } from "@/lib/journey-ai/mock-heuristics";
import { aiProviderMode, getJourneyAIProvider } from "@/lib/journey-ai/provider";
import {
  DEFAULT_OPENAI_MODEL,
  ExternalJourneyAIProvider,
  JourneyAIConfigurationError,
  readExternalProviderConfig,
} from "@/lib/journey-ai/external-provider";
import { journeyAIResponseSchema } from "@/lib/journey-ai/response-schema";
import { buildJourneySystemPrompt } from "@/lib/journey-ai/system-prompt";
import { activityProposalPayloadSchema, isActivityList, parseProposalPayload } from "@/lib/journey/proposal-schemas";
import type { JourneyAIInput, JourneyAIRequest } from "@/lib/journey-ai/types";
import { activity, outcome, snapshot } from "./fixtures";

const mock = new MockJourneyAIProvider();

function request(overrides: Partial<JourneyAIRequest> & { input: JourneyAIInput }): JourneyAIRequest {
  const snap = overrides.snapshot ?? snapshot();
  return { snapshot: snap, stage: snap.currentStage, state: null, pendingProposal: null, history: [], ...overrides };
}

async function respond(req: JourneyAIRequest) {
  // Toda resposta do mock deve respeitar o contrato validado no servidor.
  const res = journeyAIResponseSchema.parse(await mock.respond(req));
  if (res.proposal) parseProposalPayload(res.proposal.type, res.proposal.payload);
  return res;
}

describe("feature flag AI_PROVIDER", () => {
  it("usa mock por padrão", () => {
    expect(aiProviderMode({})).toBe("mock");
    expect(getJourneyAIProvider({}).isMock).toBe(true);
  });

  it("erro amigável ao ativar o modo externo sem configuração", () => {
    expect(() => getJourneyAIProvider({ AI_PROVIDER: "external" })).toThrow(JourneyAIConfigurationError);
    expect(() => readExternalProviderConfig({ AI_PROVIDER: "external" })).toThrow(/OPENAI_API_KEY/);
  });

  it("recusa valores desconhecidos", () => {
    expect(() => aiProviderMode({ AI_PROVIDER: "gpt" })).toThrow(JourneyAIConfigurationError);
  });

  it("modo externo usa a OpenAI, com o modelo de OPENAI_MODEL ou o padrão", () => {
    const provider = getJourneyAIProvider({ AI_PROVIDER: "external", OPENAI_API_KEY: "sk-teste" });
    expect(provider).toBeInstanceOf(ExternalJourneyAIProvider);
    expect(provider.isMock).toBe(false);
    expect(readExternalProviderConfig({ OPENAI_API_KEY: "sk-teste" }).model).toBe(DEFAULT_OPENAI_MODEL);
    expect(readExternalProviderConfig({ OPENAI_API_KEY: "sk-teste", OPENAI_MODEL: "outro" }).model).toBe("outro");
  });

  it("system prompt começa com o .md da metodologia, íntegro, seguido do contrato", () => {
    const prompt = buildJourneySystemPrompt();
    expect(prompt).toContain(readFileSync("src/lib/journey-ai/jornada-impacto-system-prompt.md", "utf8").trim());
    expect(prompt.startsWith("# Jornada de Impacto — Instruções do Agente")).toBe(true);
    expect(prompt).toMatch(/requiresApproval/);
    expect(prompt).toMatch(/Impacto de longo prazo/);
    expect(prompt).toMatch(/não pode ultrapassar sua duração/);
    expect(prompt).toMatch(/NÃO trabalha com linha de base/);
  });
});

describe("consultor mock — atividades", () => {
  const snap = snapshot({ approved: ["CONTEXT"] });

  it("recusa intenção abstrata e pede ação concreta", async () => {
    const res = await respond(request({ snapshot: snap, input: { kind: "MESSAGE", text: "conscientizar jovens" } }));
    expect(res.message).toMatch(/intenção/);
    expect(res.proposal).toBeUndefined();
  });

  it("2.1 mapeamento: começa pedindo a lista de ações, sem metas nem indicadores", async () => {
    const res = await respond(request({ snapshot: snap, input: { kind: "START" } }));
    expect(res.message).toMatch(/listar as ações práticas do projeto/);
    expect(res.message).not.toMatch(/Indicador|meta/i);
    expect(res.proposal).toBeUndefined();
  });

  it("2.1 mapeamento: as atividades informadas viram a lista para validação", async () => {
    const res = await respond(
      request({ snapshot: snap, input: { kind: "MESSAGE", text: "oficinas de robótica com sucata; palestras socioemocionais" } }),
    );
    const payload = activityProposalPayloadSchema.parse(res.proposal!.payload);
    expect(isActivityList(payload)).toBe(true);
    if (isActivityList(payload)) expect(payload.activities).toHaveLength(2);
    expect(res.message).not.toMatch(/Indicador/i);
  });

  it("2.2 → 2.3: com a lista aprovada, detalha uma atividade por vez e só depois traz a ficha", async () => {
    const listed = snapshot({ approved: ["CONTEXT"], activities: [activity("a1", "Ofertar oficinas de robótica com sucata", false)] });
    const ask = await respond(request({ snapshot: listed, input: { kind: "EVENT", event: "PROPOSAL_APPROVED", proposalType: "ACTIVITY" } }));
    expect(ask.message).toMatch(/\*\*Atividade 01:\*\* Ofertar oficinas de robótica/);
    expect(ask.message).toMatch(/o que será ofertado\?/i);
    expect(ask.proposal).toBeUndefined();
    expect(ask.state).toMatchObject({ kind: "ACTIVITY_DRAFT", step: "ASK_TARGET", activityId: "a1" });

    const form = await respond(
      request({ snapshot: listed, state: ask.state!, input: { kind: "MESSAGE", text: "12 encontros com 40 crianças até o 6º mês" } }),
    );
    const payload = activityProposalPayloadSchema.parse(form.proposal!.payload);
    expect(isActivityList(payload)).toBe(false);
    if (!isActivityList(payload)) {
      expect(payload.activityId).toBe("a1");
      expect(payload.target.quantity).toBe(12);
      expect(payload.indicators.length).toBeGreaterThan(0);
    }
  });

  it("2.2: meta já informada na atividade → mostra a meta e pergunta se há algo a acrescentar", async () => {
    const listed = snapshot({
      approved: ["CONTEXT"],
      activities: [activity("a1", "Ofertar 10 palestras socioemocionais para 50 adolescentes durante 6 meses", false)],
    });
    const ask = await respond(request({ snapshot: listed, input: { kind: "START" } }));
    expect(ask.proposal).toBeUndefined();
    expect(ask.message).toMatch(/Meta informada:\*\* Ofertar 10 palestras/);
    expect(ask.message).toMatch(/acrescentar mais alguma informação à meta/);

    // "Não" → segue só com o que já foi informado, sem "a definir".
    const form = await respond(request({ snapshot: listed, state: ask.state!, input: { kind: "MESSAGE", text: "não, só isso" } }));
    const payload = activityProposalPayloadSchema.parse(form.proposal!.payload);
    if (!isActivityList(payload)) {
      expect(payload.target.description).toBe("Ofertar 10 palestras socioemocionais para 50 adolescentes durante 6 meses");
      expect(payload.target.durationMonths).toBe(6);
    }
  });

  it("enquanto há proposta pendente, pede uma decisão", async () => {
    const res = await respond(
      request({ snapshot: snap, pendingProposal: { id: "p", type: "ACTIVITY", payload: {} }, input: { kind: "MESSAGE", text: "oi" } }),
    );
    expect(res.proposal).toBeUndefined();
    expect(res.message).toMatch(/aguardando sua decisão/);
  });
});

describe("consultor mock — mudanças esperadas", () => {
  const activities = [
    activity("a1", "Realizar capacitações técnicas sobre produção agrícola adaptada ao semiárido."),
    activity("a2", "Fornecer mudas e sementes para os quintais."),
    activity("a3", "Apoiar a participação em feiras."),
    activity("a4", "Implantar pontos de venda comunitários."),
  ];

  it("abre a etapa 3 com a frase prevista e no máximo três sugestões", async () => {
    const snap = snapshot({ approved: ["CONTEXT", "ACTIVITIES"], activities });
    const res = await respond(request({ snapshot: snap, input: { kind: "EVENT", event: "STAGE_APPROVED", stage: "ACTIVITIES" } }));
    expect(res.message).toMatch(/^A Etapa 2 — Atividades e Resultados está aprovada\./);
    expect(res.message).toMatch(/Etapa 3 — Resultados de Médio Prazo/);
    expect(res.message).toMatch(/Resultado 01\nA partir de/);
    const payload = parseProposalPayload("OUTCOME", res.proposal!.payload);
    if (payload.type === "OUTCOME" && payload.payload.step === "STATEMENTS") {
      expect(payload.payload.outcomes.length).toBeLessThanOrEqual(3);
    }
  });

  it("depois das mudanças aprovadas, pede a meta do Resultado 01 sem inventar números", async () => {
    const snap = snapshot({
      approved: ["CONTEXT", "ACTIVITIES"],
      activities,
      outcomes: [outcome("o1", "as famílias participantes ampliem a produção de alimentos em seus quintais")],
    });
    const res = await respond(request({ snapshot: snap, input: { kind: "EVENT", event: "PROPOSAL_APPROVED", proposalType: "OUTCOME" } }));
    expect(res.message).toMatch(/^Vamos definir a meta para este resultado\./);
    expect(res.message).toMatch(/Resultado 01:/);
    expect(res.message).toMatch(/\[X% ou X famílias\]/);
    expect(res.message).not.toMatch(/\d+%/);
  });

  it("sugere indicador e verificação automaticamente após a meta", async () => {
    const snap = snapshot({
      approved: ["CONTEXT", "ACTIVITIES"],
      activities,
      outcomes: [outcome("o1", "as famílias participantes passem a utilizar novos canais de comercialização", { target: "50% das famílias" })],
    });
    const res = await respond(request({ snapshot: snap, input: { kind: "EVENT", event: "PROPOSAL_APPROVED", proposalType: "OUTCOME" } }));
    const payload = parseProposalPayload("OUTCOME", res.proposal!.payload);
    expect(payload.type === "OUTCOME" && payload.payload.step).toBe("INDICATOR");
    if (payload.type === "OUTCOME" && payload.payload.step === "INDICATOR") {
      expect(payload.payload.verification).toBe("Relatório de utilização dos canais de comercialização");
    }
  });
});

describe("consultor mock — impacto e plano", () => {
  const base = {
    approved: ["CONTEXT", "ACTIVITIES", "OUTCOMES"] as const,
    activities: [activity("a1", "Realizar oficinas.")],
    outcomes: [
      outcome("o1", "as famílias ampliem a produção", {
        target: "60%",
        indicators: [{ name: "Percentual", explanation: null }],
        evidences: ["Relatório de evolução das famílias"],
      }),
    ],
  };

  it("após aprovar a formulação, apresenta as três opções e 'Ver exemplos'", async () => {
    const snap = snapshot({ ...base, approved: [...base.approved], impact: { id: "i1", statement: "Contribuir para a segurança alimentar", followUpOption: null, followUps: [] } });
    const res = await respond(request({ snapshot: snap, input: { kind: "EVENT", event: "PROPOSAL_APPROVED", proposalType: "IMPACT" } }));
    expect(res.message).toMatch(/A formulação do impacto de longo prazo foi aprovada/);
    expect(res.message).not.toMatch(/direção de impacto/i);
    expect(res.actions.map((a) => a.intent)).toContain("SHOW_EXAMPLES");
    const examples = await respond(
      request({ snapshot: snap, input: { kind: "ACTION", actionId: "show-examples", intent: "SHOW_EXAMPLES", label: "Ver exemplos" } }),
    );
    expect(examples.message).toMatch(/ilustrativos/);
    expect(examples.proposal).toBeUndefined();
  });

  it("uma nova mensagem reformula a formulação do impacto ainda pendente", async () => {
    const snap = snapshot({ ...base, approved: [...base.approved] });
    const res = await respond(
      request({
        snapshot: snap,
        pendingProposal: { id: "p", type: "IMPACT", payload: { step: "STATEMENT", statement: "Erradicar a fome" } },
        input: { kind: "MESSAGE", text: "as famílias tenham segurança alimentar" },
      }),
    );
    expect(res.proposal?.type).toBe("IMPACT");
    expect(res.message).not.toMatch(/aguardando sua decisão/);
  });

  it("por ora, encerra no impacto e aponta o resumo, sem propor o plano de evidências", async () => {
    const snap = snapshot({
      ...base,
      approved: ["CONTEXT", "ACTIVITIES", "OUTCOMES", "IMPACT"],
      impact: { id: "i1", statement: "Contribuir para...", followUpOption: "VISION_ONLY", followUps: [] },
    });
    const res = await respond(request({ snapshot: snap, input: { kind: "EVENT", event: "STAGE_APPROVED", stage: "IMPACT" } }));
    expect(res.proposal).toBeUndefined();
    expect(res.message).toMatch(/resumo/i);
  });
});

describe("heurísticas do mock", () => {
  it("formula atividade como ação", () => {
    expect(formulateActivity("oficinas de leitura")).toBe("Realizar oficinas de leitura.");
    expect(formulateActivity("fornecer mudas")).toBe("Fornecer mudas.");
  });

  it("extrai apenas números informados", () => {
    expect(extractQuantity("12 encontros em 6 meses")).toEqual({ quantity: 12, unit: "encontros" });
    expect(extractQuantity("a definir")).toBeNull();
  });


  it("não sugere mais de três mudanças", () => {
    const acts = ["Realizar oficinas", "Fornecer mudas", "Apoiar feiras", "Treinos de futebol", "Produzir vídeos"].map((d, i) => activity(`a${i}`, d));
    expect(suggestOutcomes(acts, "famílias", "").length).toBeLessThanOrEqual(3);
  });
});
