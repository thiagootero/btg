import { describe, expect, it, vi } from "vitest";
import { APIConnectionTimeoutError, RateLimitError } from "openai";
import {
  ExternalJourneyAIProvider,
  JourneyAIProviderError,
  MAX_OUTPUT_TOKENS,
  recentHistory,
  type ResponsesClient,
  hasForeignScript,
  withValidActions,
} from "@/lib/journey-ai/external-provider";
import { fromOpenAIOutput, OPENAI_RESPONSE_SCHEMA } from "@/lib/journey-ai/openai-schema";
import type { JourneyAIInput, JourneyAIRequest, JourneyAIUsage } from "@/lib/journey-ai/types";
import { snapshot } from "./fixtures";

const config = { apiKey: "sk-teste-nao-usar", model: "modelo-teste", timeoutMs: 1000 };

function request(input: JourneyAIInput, overrides: Partial<JourneyAIRequest> = {}): JourneyAIRequest {
  const snap = snapshot({ approved: ["CONTEXT"] });
  return { snapshot: snap, stage: snap.currentStage, state: null, pendingProposal: null, history: [], input, ...overrides };
}

const validOutput = {
  message: "Qual é a primeira atividade do projeto?",
  currentStage: "ACTIVITIES",
  proposal: null,
  actions: [{ id: "show-examples", label: "Ver exemplos", intent: "SHOW_EXAMPLES" }],
  requiresApproval: false,
  state: { kind: "KEEP" },
};

/** Cliente simulado: devolve a resposta indicada ou lança o erro, sem rede. */
function fakeClient(result: Record<string, unknown> | Error) {
  const create = vi.fn(async () => {
    if (result instanceof Error) throw result;
    return { status: "completed", output: [], usage: { input_tokens: 120, output_tokens: 40 }, ...result };
  });
  return { client: { responses: { create } } as unknown as ResponsesClient, create };
}

function provider(result: Record<string, unknown> | Error) {
  const usage: JourneyAIUsage[] = [];
  const { client, create } = fakeClient(result);
  const instance = new ExternalJourneyAIProvider(config, {
    client,
    recordUsage: async (u) => {
      usage.push(u);
    },
  });
  return { instance, usage, create };
}

describe("schema estrito da OpenAI", () => {
  it("todo objeto declara todas as propriedades como obrigatórias e não aceita extras", () => {
    const visit = (node: unknown): void => {
      if (Array.isArray(node)) return node.forEach(visit);
      if (!node || typeof node !== "object") return;
      const schema = node as Record<string, unknown>;
      if (schema.type === "object") {
        expect(schema.additionalProperties).toBe(false);
        expect(schema.required).toEqual(Object.keys(schema.properties as object));
      }
      Object.values(schema).forEach(visit);
    };
    visit(OPENAI_RESPONSE_SCHEMA);
  });

  it("converte as convenções do formato estrito para o contrato do sistema", () => {
    const res = fromOpenAIOutput(validOutput);
    expect(res.proposal).toBeUndefined();
    expect(res.state).toBeUndefined(); // KEEP mantém o rascunho
    expect(fromOpenAIOutput({ ...validOutput, state: null }).state).toBeNull(); // null limpa
  });
});

describe("ExternalJourneyAIProvider (OpenAI simulada)", () => {
  it("envia instruções, contexto, nova mensagem e limites; registra o uso", async () => {
    const { instance, usage, create } = provider({ output_text: JSON.stringify(validOutput) });
    const res = await instance.respond(request({ kind: "MESSAGE", text: "Vamos começar" }));
    expect(res.message).toMatch(/primeira atividade/);

    const [params, options] = create.mock.calls[0] as unknown as [Record<string, unknown>, Record<string, unknown>];
    expect(params.model).toBe("modelo-teste");
    expect(params.max_output_tokens).toBe(MAX_OUTPUT_TOKENS);
    expect(params.store).toBe(false);
    expect(params.tools).toBeUndefined();
    expect(params.instructions).toMatch(/Jornada de Impacto/);
    expect((params.text as { format: { strict: boolean } }).format.strict).toBe(true);
    const lastInput = (params.input as Array<{ content: string }>).at(-1)!.content;
    expect(lastInput).toMatch(/Projeto Teste/);
    expect(lastInput).toMatch(/Nova mensagem da pessoa usuária:\nVamos começar/);
    expect(JSON.stringify(params)).not.toContain(config.apiKey);
    expect(options.maxRetries).toBe(0);

    expect(usage).toEqual([{ model: "modelo-teste", inputTokens: 120, outputTokens: 40, status: "SUCCESS" }]);
  });

  it("valida a proposta com Zod e recusa formato inválido", async () => {
    const output = { ...validOutput, proposal: { type: "ACTIVITY", payload: { description: "" } } };
    const { instance, usage } = provider({ output_text: JSON.stringify(output) });
    await expect(instance.respond(request({ kind: "START" }))).rejects.toMatchObject({ status: "INVALID_RESPONSE" });
    expect(usage[0].status).toBe("INVALID_RESPONSE");
  });

  it("recusa resposta com caracteres de outro alfabeto (nada é gravado)", async () => {
    const output = { ...validOutput, message: "Número de escolas सहभागीdas" };
    const { instance, usage } = provider({ output_text: JSON.stringify(output) });
    await expect(instance.respond(request({ kind: "START" }))).rejects.toMatchObject({
      status: "INVALID_RESPONSE",
      userMessage: expect.stringMatching(/caracteres inválidos/),
    });
    expect(usage[0].status).toBe("INVALID_RESPONSE");
  });

  it("resposta incompleta (limite de tokens) vira erro claro", async () => {
    const { instance, usage } = provider({ status: "incomplete", incomplete_details: { reason: "max_output_tokens" } });
    await expect(instance.respond(request({ kind: "START" }))).rejects.toBeInstanceOf(JourneyAIProviderError);
    expect(usage[0]).toMatchObject({ status: "INCOMPLETE", outputTokens: 40 });
  });

  it("recusa do modelo vira erro claro", async () => {
    const { instance } = provider({ output: [{ type: "message", content: [{ type: "refusal", refusal: "não" }] }] });
    await expect(instance.respond(request({ kind: "START" }))).rejects.toMatchObject({ status: "REFUSED" });
  });

  it("falhas da API não são repetidas e não expõem a chave", async () => {
    const timeout = provider(new APIConnectionTimeoutError());
    const error = await timeout.instance.respond(request({ kind: "START" })).catch((e) => e);
    expect(error).toMatchObject({ status: "TIMEOUT" });
    expect(timeout.create).toHaveBeenCalledTimes(1);
    expect(timeout.usage[0]).toMatchObject({ status: "TIMEOUT", inputTokens: 0 });

    const limited = provider(new RateLimitError(429, { message: "limite" }, "limite", new Headers()));
    const limitError = (await limited.instance.respond(request({ kind: "START" })).catch((e) => e)) as JourneyAIProviderError;
    expect(limitError.userMessage).toMatch(/limite de uso/);
    expect(`${limitError.userMessage} ${limitError.detail}`).not.toContain(config.apiKey);
  });
});

describe("histórico enviado ao modelo", () => {
  it("só a etapa atual, sem repetir a mensagem do turno", () => {
    const history = [
      { role: "assistant" as const, content: "Contexto ok?", stage: "CONTEXT" as const },
      { role: "assistant" as const, content: "Qual a atividade?", stage: "ACTIVITIES" as const },
      { role: "user" as const, content: "Oficinas", stage: "ACTIVITIES" as const },
    ];
    const result = recentHistory(request({ kind: "MESSAGE", text: "Oficinas" }, { history }));
    expect(result.map((m) => m.content)).toEqual(["Qual a atividade?"]);
  });
});

describe("opções sugeridas pelo modelo", () => {
  const actions = [
    { id: "navigate:/projetos/p1/relatorio", label: "Relatório", intent: "CONTINUE" },
    { id: "navigate:/projeto/teste", label: "Inventado", intent: "CONTINUE" },
    { id: "navigate:/projetos/outro", label: "Outro projeto", intent: "CONTINUE" },
    { id: "navigate://site.com", label: "Externo", intent: "CONTINUE" },
    { id: "approve-proposal", label: "Aprovar", intent: "APPROVE" },
    { id: "approve-stage", label: "Aprovar etapa", intent: "APPROVE" },
    { id: "show-examples", label: "Ver exemplos", intent: "SHOW_EXAMPLES" },
  ] as const;
  const ids = (response: { actions: readonly { id: string }[] }) => response.actions.map((a) => a.id);
  const reply = { message: "Ok", currentStage: "ACTIVITIES" as const, requiresApproval: false, actions: [...actions] };

  it("remove links de fora do projeto, decisões sem proposta e etapa incompleta", () => {
    expect(ids(withValidActions(reply, request({ kind: "START" })))).toEqual(["navigate:/projetos/p1/relatorio", "show-examples"]);
  });

  it("com atividade em rascunho sem ficha, não oferece avançar", () => {
    const draft = {
      ...reply,
      actions: [
        { id: "add-activity", label: "Acrescentar outra atividade", intent: "ADD" as const },
        { id: "continue", label: "Continuar", intent: "CONTINUE" as const },
        { id: "show-examples", label: "Ver exemplos", intent: "SHOW_EXAMPLES" as const },
      ],
    };
    const req = request(
      { kind: "MESSAGE", text: "segue só com a meta que falei" },
      { state: { kind: "ACTIVITY_DRAFT", step: "ASK_TARGET", description: "Ofertar oficinas" } },
    );
    expect(ids(withValidActions(draft, req))).toEqual(["show-examples"]);
  });

  it("mantém as decisões quando há proposta", () => {
    const withProposal = { ...reply, proposal: { type: "ACTIVITY" as const, payload: {} } };
    expect(ids(withValidActions(withProposal, request({ kind: "START" })))).toContain("approve-proposal");
    expect(ids(withValidActions(withProposal, request({ kind: "START" })))).not.toContain("approve-stage");
  });
});

describe("texto com caracteres de outro alfabeto", () => {
  it("detecta letras não latinas e aceita português com acentos", () => {
    expect(hasForeignScript("Número de escolas सहभागीdas")).toBe(true);
    expect(hasForeignScript("Número de escolas участ")).toBe(true);
    expect(hasForeignScript("Número de crianças e adolescentes participantes — 100% (meta: 12 meses)")).toBe(false);
  });
});
