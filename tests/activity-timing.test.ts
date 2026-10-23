import { describe, expect, it } from "vitest";
import { MockJourneyAIProvider } from "@/lib/journey-ai/mock-provider";
import { extractActivityPeriod, extractDurationMonths } from "@/lib/journey-ai/mock-heuristics";
import { journeyAIResponseSchema, type JourneyAIResponse } from "@/lib/journey-ai/response-schema";
import { enforceActivityFlow, enforceActivityTiming, enforceCurrentStage } from "@/lib/journey-ai/proposal-guards";
import { durationText } from "@/lib/journey/format";
import { checkProposal } from "@/lib/journey/proposal-rules";
import { activityPayloadSchema, type ActivityPeriod } from "@/lib/journey/proposal-schemas";
import * as fx from "./fixtures";
import { snapshot } from "./fixtures";

// Projeto de 12 meses, na etapa de atividades.
const snap = snapshot({ approved: ["CONTEXT"] });

function activity(durationMonths: number | null, period: ActivityPeriod | null = null) {
  return activityPayloadSchema.parse({
    description: "Realizar oficinas de balé para as crianças",
    target: { description: "Oficinas semanais para 50 alunos", deadline: null, quantity: 50, unit: "alunos", durationMonths, period },
    indicators: [{ name: "Número de oficinas realizadas", explanation: null }],
    evidences: [{ description: "Lista de presença" }],
  });
}

function aiReply(payload: unknown): JourneyAIResponse {
  return {
    message: "Perfeito! Organizei a ficha.",
    currentStage: "ACTIVITIES",
    proposal: { type: "ACTIVITY", payload },
    actions: [{ id: "approve-proposal", label: "Aprovar", intent: "APPROVE" }],
    requiresApproval: true,
  };
}

describe("coerência temporal — regra do servidor (aprovação e edição)", () => {
  const issues = (payload: ReturnType<typeof activity>) =>
    checkProposal({ type: "ACTIVITY", payload }, snap).map((i) => i.field);

  it("projeto de 12 meses + atividade de 13 meses → pede ajuste (não pode ser aprovada)", () => {
    expect(issues(activity(13))).toEqual(["target.durationMonths"]);
  });

  it("projeto de 12 meses + atividade de 10 meses → permite", () => {
    expect(issues(activity(10))).toEqual([]);
  });

  it("projeto de 12 meses + atividade de 12 meses → permite (igual à duração)", () => {
    expect(issues(activity(12))).toEqual([]);
  });

  it("projeto de 12 meses + atividade sem duração → fica “a definir”, sem bloquear", () => {
    const payload = activity(null);
    expect(payload.target.durationMonths).toBeNull();
    expect(durationText(payload.target.durationMonths)).toBe("a definir");
    expect(issues(payload)).toEqual([]);
  });

  it("projeto de 12 meses + atividade posterior ao encerramento → pede esclarecimento", () => {
    expect(issues(activity(3, "AFTER_PROJECT"))).toEqual(["target.period"]);
    expect(issues(activity(null, "BEFORE_PROJECT"))).toEqual(["target.period"]);
  });
});

describe("coerência temporal — resposta do consultor (qualquer provedor)", () => {
  it("13 meses: descarta a ficha e devolve o pedido de ajuste", () => {
    const res = enforceActivityTiming(aiReply(activity(13)), snap);
    expect(res.proposal).toBeUndefined();
    expect(res.requiresApproval).toBe(false);
    expect(res.actions).toEqual([]);
    expect(res.message).not.toMatch(/Perfeito/);
    expect(res.message).toContain(
      "Há uma inconsistência a ajustar: o projeto tem duração de 12 meses, mas a atividade foi prevista para 13 meses.",
    );
    expect(res.message).toContain("1. realizar a atividade durante os 12 meses do projeto;");
    expect(res.message).toContain("2. revisar a duração geral do projeto;");
    expect(res.message).toContain("3. esclarecer se existe alguma etapa anterior ou posterior ao período oficial?");
    // O rascunho volta à pergunta da meta, com a atividade preservada.
    expect(res.state).toEqual({
      kind: "ACTIVITY_DRAFT",
      step: "ASK_TARGET",
      description: "Realizar oficinas de balé para as crianças",
      activityId: null,
    });
    expect(() => journeyAIResponseSchema.parse(res)).not.toThrow();
  });

  it("10 meses: mantém a ficha intacta", () => {
    const reply = aiReply(activity(10));
    expect(enforceActivityTiming(reply, snap)).toBe(reply);
  });

  it("sem duração: mantém a ficha, com duração “a definir”", () => {
    const reply = aiReply(activity(null));
    expect(enforceActivityTiming(reply, snap)).toBe(reply);
  });

  it("posterior ao encerramento: descarta a ficha e pede esclarecimento", () => {
    const res = enforceActivityTiming(aiReply(activity(2, "AFTER_PROJECT")), snap);
    expect(res.proposal).toBeUndefined();
    expect(res.message).toMatch(/esclarecimento/);
    expect(res.message).toMatch(/depois do encerramento do projeto, que tem duração de 12 meses/);
  });
});

describe("coerência temporal — de ponta a ponta com o mock", () => {
  const mock = new MockJourneyAIProvider();
  const turn = async (text: string) =>
    enforceActivityTiming(
      journeyAIResponseSchema.parse(
        await mock.respond({
          snapshot: snap,
          stage: "ACTIVITIES",
          state: { kind: "ACTIVITY_DRAFT", step: "ASK_TARGET", description: "Realizar oficinas de balé" },
          pendingProposal: null,
          history: [],
          input: { kind: "MESSAGE", text },
        }),
      ),
      snap,
    );

  it("oficinas durante 13 meses em projeto de 12 → não gera ficha", async () => {
    const res = await turn("Oficinas semanais para 50 alunos durante 13 meses");
    expect(res.proposal).toBeUndefined();
    expect(res.message).toMatch(/^Há uma inconsistência a ajustar/);
  });

  it("oficinas durante 10 meses → gera ficha com a duração", async () => {
    const res = await turn("Oficinas semanais para 50 alunos durante 10 meses");
    expect(res.proposal?.type).toBe("ACTIVITY");
    expect(activityPayloadSchema.parse(res.proposal?.payload).target.durationMonths).toBe(10);
  });
});

describe("extração da duração no mock", () => {
  it("lê meses e anos e ignora ordinais de prazo", () => {
    expect(extractDurationMonths("durante 13 meses")).toBe(13);
    expect(extractDurationMonths("por 1 ano")).toBe(12);
    expect(extractDurationMonths("até o 6º mês")).toBeNull();
  });

  it("reconhece atividade antes ou depois do projeto", () => {
    expect(extractActivityPeriod("Uma feira após o encerramento do projeto")).toBe("AFTER_PROJECT");
    expect(extractActivityPeriod("Mobilização antes do início do projeto")).toBe("BEFORE_PROJECT");
    expect(extractActivityPeriod("Oficinas semanais")).toBeNull();
  });
});

describe("ordem da Etapa 2: lista → detalhamento → ficha", () => {
  const form = (activityId: string | null, target = "a definir") =>
    activityPayloadSchema.parse({
      activityId,
      description: "Ofertar palestras socioemocionais para crianças e adolescentes",
      target: { description: target, deadline: null, quantity: null, unit: null, durationMonths: null, period: null },
      indicators: [{ name: "Número de palestras realizadas", explanation: null }],
      evidences: [{ description: "Lista de presença" }],
    });
  const withList = snapshot({
    approved: ["CONTEXT"],
    activities: [{ ...fx.activity("a1", "Ofertar palestras socioemocionais para crianças e adolescentes", false) }],
  });
  const draft = { kind: "ACTIVITY_DRAFT" as const, step: "ASK_TARGET" as const, description: "Ofertar palestras", activityId: "a1" };

  it("sem lista aprovada (2.1) → nenhuma ficha; volta ao mapeamento", () => {
    const res = enforceActivityFlow(aiReply(form(null)), { snapshot: snap, state: null, pendingProposalType: null, inputKind: "MESSAGE" });
    expect(res.proposal).toBeUndefined();
    expect(res.message).toMatch(/vamos listar as ações práticas do projeto/);
    expect(res.state).toBeNull();
  });

  it("ficha antes de perguntar o que será ofertado (2.2) → descartada, mantém a pergunta", () => {
    const asking = { ...aiReply(form("a1")), message: "**Atividade:** ofertar palestras.\n\nQuantas palestras, para quantas crianças e em qual período?" };
    const res = enforceActivityFlow(asking, { snapshot: withList, state: null, pendingProposalType: null, inputKind: "MESSAGE" });
    expect(res.proposal).toBeUndefined();
    expect(res.requiresApproval).toBe(false);
    expect(res.message).toBe(asking.message);
    expect(res.state).toMatchObject({ kind: "ACTIVITY_DRAFT", step: "ASK_TARGET", activityId: "a1", target: null });
  });

  it("mensagem que apresenta a ficha antes da hora → trocada pela pergunta do que será ofertado", () => {
    const res = enforceActivityFlow(aiReply(form("a1")), { snapshot: withList, state: null, pendingProposalType: null, inputKind: "MESSAGE" });
    expect(res.proposal).toBeUndefined();
    expect(res.message).toMatch(/o que será ofertado\?/);
    expect(res.message).not.toMatch(/Indicador/i);
  });

  it("meta já informada → mostra a meta e pergunta se há algo a acrescentar", () => {
    const res = enforceActivityFlow(aiReply(form("a1", "10 palestras para 60 crianças")), {
      snapshot: withList,
      state: null,
      pendingProposalType: null,
      inputKind: "MESSAGE",
    });
    expect(res.message).toMatch(/\*\*Meta informada:\*\* 10 palestras para 60 crianças/);
    expect(res.actions.map((a) => a.id)).toEqual(["meta-complete"]);
  });

  it("depois da pergunta (rascunho da mesma atividade) → ficha aceita, com o id da atividade", () => {
    const res = enforceActivityFlow(aiReply(form(null, "10 palestras")), { snapshot: withList, state: draft, pendingProposalType: null, inputKind: "MESSAGE" });
    expect(res.proposal?.type).toBe("ACTIVITY");
    expect(activityPayloadSchema.parse(res.proposal?.payload).activityId).toBe("a1");
  });

  it("atividade fora da lista → proposta de incluí-la na lista primeiro", () => {
    const res = enforceActivityFlow(aiReply(form(null, "10 palestras")), { snapshot: withList, state: null, pendingProposalType: null, inputKind: "MESSAGE" });
    expect(res.proposal).toEqual({
      type: "ACTIVITY",
      payload: { step: "LIST", activities: [{ description: "Ofertar palestras socioemocionais para crianças e adolescentes" }] },
    });
  });

  it("revisão de uma ficha pendente → aceita", () => {
    const reply = aiReply(form("a1", "10 palestras"));
    expect(enforceActivityFlow(reply, { snapshot: withList, state: null, pendingProposalType: "ACTIVITY", inputKind: "MESSAGE" })).toBe(reply);
  });

  it("lista de atividades (2.1) em resposta à pessoa → aceita", () => {
    const list = { ...aiReply({ step: "LIST", activities: [{ description: "Ofertar palestras" }] }) };
    expect(enforceActivityFlow(list, { snapshot: snap, state: null, pendingProposalType: null, inputKind: "MESSAGE" })).toBe(list);
  });

  it("lista de atividades na abertura, antes de a pessoa responder → descartada, fica só a pergunta", () => {
    const list = {
      ...aiReply({ step: "LIST", activities: [{ description: "Ofertar capacitações técnicas" }] }),
      message: "Agora vamos listar as ações práticas do projeto. O que a equipe realizará para colocar essa estratégia em prática?",
    };
    const res = enforceActivityFlow(list, { snapshot: snap, state: null, pendingProposalType: null, inputKind: "EVENT" });
    expect(res.proposal).toBeUndefined();
    expect(res.requiresApproval).toBe(false);
    expect(res.message).toBe(list.message);
  });
});

describe("a etapa só muda quando a pessoa a aprova", () => {
  const outcomesReply: JourneyAIResponse = {
    message: "Agora iniciamos a Etapa 3...",
    currentStage: "OUTCOMES",
    proposal: { type: "OUTCOME", payload: { step: "STATEMENTS", outcomes: [], explicitRequestForMore: false } },
    actions: [],
    requiresApproval: true,
  };

  it("atividades completas + proposta da Etapa 3 → descarta e pede aprovação da etapa", () => {
    const done = snapshot({ approved: ["CONTEXT"], activities: [fx.activity("a1", "Ofertar oficinas")] });
    const res = enforceCurrentStage(outcomesReply, done);
    expect(res.proposal).toBeUndefined();
    expect(res.currentStage).toBe("ACTIVITIES");
    expect(res.message).toMatch(/está completa/);
    expect(res.actions.map((a) => a.id)).toEqual(["approve-stage"]);
  });

  it("atividades incompletas + proposta da Etapa 3 → descarta e diz o que falta", () => {
    const pending = snapshot({ approved: ["CONTEXT"], activities: [fx.activity("a1", "Ofertar oficinas", false)] });
    const res = enforceCurrentStage(outcomesReply, pending);
    expect(res.proposal).toBeUndefined();
    expect(res.message).toMatch(/ainda falta concluir/);
    expect(res.actions).toEqual([]);
  });

  it("proposta da etapa atual → mantida", () => {
    const reply = aiReply(activity(6));
    expect(enforceCurrentStage(reply, snap)).toBe(reply);
  });
});
