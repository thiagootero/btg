import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AccessUser } from "@/lib/auth/permissions";
import type { JourneyStageKey } from "@/lib/journey/stages";
import { RESULTS_LOCKED_MESSAGE } from "@/lib/results/status";
import type { ResultFormSpec } from "@/lib/results/form-spec";
import type { ResultTextProvider } from "@/lib/results-ai/types";
import { activity, outcome, snapshot } from "./fixtures";

// Banco simulado: só os métodos usados pelo serviço de resultados.
const db = vi.hoisted(() => ({
  project: { findUnique: vi.fn() },
  projectFinalEvaluation: {
    upsert: vi.fn(),
    findUnique: vi.fn(),
    findUniqueOrThrow: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
  resultRecord: {
    create: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    findUniqueOrThrow: vi.fn(),
    update: vi.fn(),
  },
  resultIndicator: { update: vi.fn() },
  aiUsage: { create: vi.fn() },
  $transaction: vi.fn(async (ops: unknown[]) => Promise.all(ops)),
}));
const loadSnapshot = vi.hoisted(() => vi.fn());
const after = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db", () => ({ prisma: db }));
vi.mock("@/server/journey/snapshot", () => ({ loadSnapshot }));
vi.mock("next/server", async (importOriginal) => ({ ...(await importOriginal<object>()), after }));

const {
  getResultsView,
  organizeResult,
  updateResultRecord,
  finalizeEvaluation,
  prepareResultsForm,
  logicFor,
  getPublicProject,
  getPublicOrganization,
} = await import("@/server/results/service");
const { ConflictError, NotFoundError } = await import("@/server/errors");

const member: AccessUser = {
  id: "u1",
  name: "Pessoa",
  email: "p@exemplo.org",
  isPlatformAdmin: false,
  memberships: [{ organizationId: "org1", organizationName: "Organização Teste", role: "ORGANIZATION_MEMBER" }],
};
const APPROVED_JOURNEY: JourneyStageKey[] = ["CONTEXT", "ACTIVITIES", "OUTCOMES", "IMPACT"];

function indicator(overrides: Record<string, unknown> = {}) {
  return {
    id: "ind1",
    recordId: "r1",
    order: 0,
    name: "Percentual de famílias",
    kind: null,
    denominator: null,
    numerator: null,
    percentage: null,
    achievedValue: null,
    unit: null,
    achievedText: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function record(overrides: Record<string, unknown> = {}) {
  return {
    id: "r1",
    evaluationId: "e1",
    sourceType: "OUTCOME",
    sourceId: "o1",
    order: 0,
    itemSnapshot: "Famílias aplicam conhecimentos",
    targetSnapshot: "Pelo menos 60% das famílias",
    baselineSnapshot: null,
    verificationSnapshot: null,
    periodSnapshot: null,
    formSpec: null,
    indicators: [indicator()],
    teamPerception: null,
    additionalContext: null,
    proposedText: null,
    proposalIsMock: false,
    aiProposedAt: null,
    approvedText: null,
    approvedAt: null,
    approvedById: null,
    status: "DRAFT",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function setup({ organizationId = "org1", approved = APPROVED_JOURNEY } = {}) {
  db.project.findUnique.mockResolvedValue({ id: "p1", organizationId });
  loadSnapshot.mockResolvedValue(
    snapshot({
      approved,
      outcomes: [outcome("o1", "Famílias aplicam conhecimentos", { target: "Pelo menos 60% das famílias" })],
    }),
  );
  db.projectFinalEvaluation.upsert.mockResolvedValue({ id: "e1" });
  db.projectFinalEvaluation.findUnique.mockResolvedValue({
    id: "e1",
    status: "DRAFT",
    startedAt: new Date(),
    completedAt: null,
    formStatus: "READY",
    formStartedAt: null,
    formSource: "ai",
    records: [record()],
  });
  db.resultRecord.findMany.mockResolvedValue([record()]);
  db.projectFinalEvaluation.findUniqueOrThrow.mockResolvedValue({ id: "e1", status: "DRAFT", records: [] });
  db.resultRecord.findFirst.mockResolvedValue(record());
  db.resultRecord.create.mockResolvedValue({});
  // Banco em memória mínimo: a releitura após salvar devolve o que foi gravado.
  let saved: Record<string, unknown> = {};
  let savedIndicator: Record<string, unknown> = {};
  db.resultIndicator.update.mockImplementation(async ({ data }) => (savedIndicator = data));
  db.resultRecord.update.mockImplementation(async ({ data }) => record((saved = data)));
  db.resultRecord.findUniqueOrThrow.mockImplementation(async () =>
    record({ ...saved, indicators: [indicator(savedIndicator)] }),
  );
}

const percentIndicator = { id: "ind1", kind: "PERCENTAGE", denominator: 32, numerator: 22, unit: "famílias" };
const percentData = {
  indicators: [percentIndicator],
  teamPerception: "As famílias diversificaram o plantio.",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("acesso apenas a projetos da própria organização", () => {
  it("projeto de outra organização responde como não encontrado", async () => {
    setup({ organizationId: "orgB" });
    await expect(getResultsView(member, "p1")).rejects.toBeInstanceOf(NotFoundError);
    await expect(updateResultRecord(member, "p1", "r1", { action: "save", data: percentData })).rejects.toBeInstanceOf(
      NotFoundError,
    );
    await expect(organizeResult(member, "p1", "r1", { data: percentData })).rejects.toBeInstanceOf(NotFoundError);
    await expect(finalizeEvaluation(member, "p1")).rejects.toBeInstanceOf(NotFoundError);
    expect(db.resultRecord.update).not.toHaveBeenCalled();
    expect(db.projectFinalEvaluation.upsert).not.toHaveBeenCalled();
  });

  it("registro de outro projeto não é encontrado", async () => {
    setup();
    db.resultRecord.findFirst.mockResolvedValue(null);
    await expect(updateResultRecord(member, "p1", "r-de-outro-projeto", { action: "discard" })).rejects.toBeInstanceOf(
      NotFoundError,
    );
    expect(db.resultRecord.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "r-de-outro-projeto", evaluation: { projectId: "p1" } } }),
    );
  });
});

describe("tela de resultados bloqueada sem a Jornada aprovada", () => {
  it("não inicia a avaliação e informa o bloqueio", async () => {
    setup({ approved: ["CONTEXT", "ACTIVITIES", "OUTCOMES"] });
    const view = await getResultsView(member, "p1");
    expect(view.unlocked).toBe(false);
    expect(view.cards).toEqual([]);
    expect(db.projectFinalEvaluation.upsert).not.toHaveBeenCalled();
  });

  it("recusa gravações", async () => {
    setup({ approved: ["CONTEXT"] });
    await expect(updateResultRecord(member, "p1", "r1", { action: "save", data: percentData })).rejects.toThrow(
      RESULTS_LOCKED_MESSAGE,
    );
    await expect(finalizeEvaluation(member, "p1")).rejects.toBeInstanceOf(ConflictError);
    expect(db.resultRecord.update).not.toHaveBeenCalled();
  });

  it("com a Jornada aprovada, cria a avaliação e os cards", async () => {
    setup();
    const view = await getResultsView(member, "p1");
    expect(view.unlocked).toBe(true);
    expect(db.projectFinalEvaluation.upsert).toHaveBeenCalled();
    expect(view.cards).toHaveLength(1);
    expect(view.cards[0].reference.target).toBe("Pelo menos 60% das famílias");
  });

  it("cria um dado para cada indicador do item", async () => {
    setup();
    const workshops = {
      ...activity("a1", "Realizar oficinas de reforço escolar"),
      indicators: [
        { name: "Número de oficinas realizadas", explanation: null },
        { name: "Número de crianças atendidas", explanation: null },
        { name: "Frequência de participação nas oficinas", explanation: null },
      ],
    };
    loadSnapshot.mockResolvedValue(snapshot({ approved: APPROVED_JOURNEY, activities: [workshops] }));
    db.resultRecord.findMany.mockResolvedValue([]);
    await getResultsView(member, "p1");
    expect(db.resultRecord.create.mock.calls[0][0].data.indicators.create).toEqual([
      { order: 0, name: "Número de oficinas realizadas" },
      { order: 1, name: "Número de crianças atendidas" },
      { order: 2, name: "Frequência de participação nas oficinas" },
    ]);
  });
});

describe("registro do resultado", () => {
  it("bloqueia numerador maior que o denominador", async () => {
    setup();
    await expect(
      updateResultRecord(member, "p1", "r1", {
        action: "save",
        data: { ...percentData, indicators: [{ ...percentIndicator, numerator: 40 }] },
      }),
    ).rejects.toMatchObject({ name: "ZodError" });
    expect(db.resultRecord.update).not.toHaveBeenCalled();
  });

  it("grava o percentual calculado pelo servidor", async () => {
    setup();
    await updateResultRecord(member, "p1", "r1", {
      action: "save",
      data: { ...percentData, indicators: [{ ...percentIndicator, percentage: 90 }] },
    });
    expect(db.resultIndicator.update.mock.calls[0][0]).toMatchObject({
      where: { id: "ind1" },
      data: { percentage: 68.8 },
    });
  });

  it("recusa dados de indicadores que não são deste item", async () => {
    setup();
    await expect(
      updateResultRecord(member, "p1", "r1", {
        action: "save",
        data: { ...percentData, indicators: [{ ...percentIndicator, id: "de-outro-item" }] },
      }),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(db.resultIndicator.update).not.toHaveBeenCalled();
  });

  it("não organiza com a IA enquanto falta o dado de algum indicador", async () => {
    setup();
    db.resultRecord.findFirst.mockResolvedValue(
      record({ indicators: [indicator(), indicator({ id: "ind2", order: 1, name: "Número de visitas" })] }),
    );
    const organize = vi.fn();
    const provider: ResultTextProvider = { name: "teste", isMock: true, generateForms: vi.fn(), organize };
    const body = { data: { ...percentData, indicators: [percentIndicator, { id: "ind2", kind: "COUNT" }] } };
    await expect(organizeResult(member, "p1", "r1", body, provider)).rejects.toMatchObject({
      fieldErrors: { "indicators.1.result": [expect.any(String)] },
    });
    expect(organize).not.toHaveBeenCalled();
  });

  it("proposta da IA é gravada como pendente, nunca como aprovada", async () => {
    setup();
    const provider: ResultTextProvider = {
      name: "teste",
      isMock: true,
      generateForms: async () => ({ forms: {} }),
      organize: async () => ({
        text: "Ao final do projeto, 22 das 32 famílias avaliadas (68,8%) diversificaram o plantio.",
      }),
    };
    await organizeResult(member, "p1", "r1", { data: percentData }, provider);
    const proposal = db.resultRecord.update.mock.calls.at(-1)![0].data;
    expect(proposal.status).toBe("AI_PROPOSED");
    expect(proposal.approvedText).toBeNull();
    expect(proposal).not.toHaveProperty("approvedAt");
  });

  it("descarta o texto da IA que altera os números", async () => {
    setup();
    const provider: ResultTextProvider = {
      name: "teste",
      isMock: false,
      generateForms: async () => ({ forms: {} }),
      organize: async () => ({
        text: "Ao final do projeto, 25 das 32 famílias avaliadas (78,1%) diversificaram o plantio.",
      }),
    };
    const view = await organizeResult(member, "p1", "r1", { data: percentData }, provider);
    expect(view.aiError).toMatch(/alterava os números/);
    const writes = db.resultRecord.update.mock.calls.map((c) => c[0].data);
    expect(writes.some((d) => d.status === "AI_PROPOSED")).toBe(false);
  });

  it("não finaliza com resultado em rascunho", async () => {
    setup();
    db.resultRecord.findMany.mockResolvedValue([record()]);
    await expect(finalizeEvaluation(member, "p1")).rejects.toBeInstanceOf(ConflictError);
    expect(db.projectFinalEvaluation.update).not.toHaveBeenCalled();
  });
});

describe("formulário personalizado", () => {
  const spec: ResultFormSpec = {
    intro: "Conte quantas famílias aplicaram as técnicas.",
    indicators: [
      {
        kind: "PERCENTAGE",
        unit: "famílias",
        denominatorQuestion: "Quantas famílias foram visitadas?",
        numeratorQuestion: "Quantas aplicam as técnicas?",
        valueQuestion: "Qual foi o valor alcançado?",
        textQuestion: "Qual foi o resultado apurado?",
      },
    ],
    perceptionHint: "O que a equipe percebeu.",
    contextHint: "Dificuldades do período.",
  };
  const provider = (generateForms: ResultTextProvider["generateForms"]): ResultTextProvider => ({
    name: "teste",
    isMock: false,
    organize: async () => ({ text: "" }),
    generateForms,
  });

  it("gera as perguntas uma única vez e grava cada formulário", async () => {
    setup();
    db.projectFinalEvaluation.updateMany.mockResolvedValue({ count: 1 });
    const generateForms = vi.fn(async () => ({ forms: { r1: spec } }));
    await prepareResultsForm("p1", provider(generateForms));
    expect(generateForms).toHaveBeenCalledOnce();
    expect(db.resultRecord.update).toHaveBeenCalledWith({ where: { id: "r1" }, data: { formSpec: spec } });
    expect(db.projectFinalEvaluation.update.mock.calls.at(-1)![0].data).toMatchObject({
      formStatus: "READY",
      formSource: "ai",
    });
  });

  it("não chama a IA se o formulário já foi gerado (ou está sendo gerado)", async () => {
    setup();
    db.projectFinalEvaluation.updateMany.mockResolvedValue({ count: 0 });
    const generateForms = vi.fn();
    await prepareResultsForm("p1", provider(generateForms));
    expect(generateForms).not.toHaveBeenCalled();
  });

  it("se a IA falhar, conclui com as perguntas padrão", async () => {
    setup();
    db.projectFinalEvaluation.updateMany.mockResolvedValue({ count: 1 });
    vi.spyOn(console, "error").mockImplementation(() => {});
    await prepareResultsForm(
      "p1",
      provider(async () => {
        throw new Error("indisponível");
      }),
    );
    expect(db.resultRecord.update).not.toHaveBeenCalled();
    expect(db.projectFinalEvaluation.update.mock.calls.at(-1)![0].data).toMatchObject({
      formStatus: "READY",
      formSource: "fallback",
    });
  });

  it("projeto concluído antes da funcionalidade: agenda a geração ao abrir a tela", async () => {
    setup();
    db.projectFinalEvaluation.findUnique.mockResolvedValue({
      id: "e1",
      status: "DRAFT",
      startedAt: new Date(),
      completedAt: null,
      formStatus: "PENDING",
      formStartedAt: null,
      formSource: null,
      records: [record()],
    });
    const view = await getResultsView(member, "p1");
    expect(after).toHaveBeenCalledOnce();
    expect(view.evaluation?.formReady).toBe(false);
    expect(view.cards[0].form.indicators[0].kind).toBe("PERCENTAGE");
  });
});

describe("lógica do projeto enviada à IA", () => {
  const journey = snapshot({
    activities: [activity("a1", "Realizar encontros com as escolas"), activity("a2", "Oficinas de leitura")],
    outcomes: [
      outcome("o1", "Escolas acompanham a frequência", { relatedActivityIds: ["a1"] }),
      outcome("o2", "Crianças melhoram a leitura", { relatedActivityIds: ["a2"] }),
    ],
    impact: { id: "i1", statement: "Trajetórias escolares mais completas.", followUpOption: null, followUps: [] },
  });

  it("atividade: os resultados que ela sustenta e o impacto", () => {
    expect(logicFor(journey, { sourceType: "ACTIVITY", sourceId: "a1" })).toEqual({
      contributesTo: ["Escolas acompanham a frequência"],
      builtOn: [],
      impact: "Trajetórias escolares mais completas.",
    });
  });

  it("resultado: as atividades que levam a ele", () => {
    expect(logicFor(journey, { sourceType: "OUTCOME", sourceId: "o2" }).builtOn).toEqual(["Oficinas de leitura"]);
  });
});

describe("páginas públicas", () => {
  it("projeto de outra organização não aparece no link da organização", async () => {
    setup();
    db.project.findUnique.mockResolvedValue({ id: "p1", organizationId: "orgB" });
    expect(await getPublicProject("organizacao-1", "projeto-p1")).toBeNull();
    expect(loadSnapshot).not.toHaveBeenCalled();
  });

  it("recusa ids fora do formato sem consultar o banco", async () => {
    expect(await getPublicProject("../../x", "p1")).toBeNull();
    expect(await getPublicOrganization("a b")).toBeNull();
    expect(db.project.findUnique).not.toHaveBeenCalled();
  });

  it("mostra o projeto da organização com os resultados registrados", async () => {
    setup();
    db.project.findUnique.mockResolvedValue({ id: "p1", organizationId: "org1-teste" });
    db.projectFinalEvaluation.findUnique.mockResolvedValue({
      status: "IN_PROGRESS",
      completedAt: null,
      records: [record({ status: "APPROVED", approvedText: "Texto aprovado.", teamPerception: "Interna." })],
    });
    const view = await getPublicProject("org1-teste", "projeto-p1");
    expect(view?.stage).toBe("RECORDING");
    expect(view?.sections[0].items[0].text).toBe("Texto aprovado.");
    expect(JSON.stringify(view)).not.toContain("Interna.");
  });
});
