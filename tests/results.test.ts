import { describe, expect, it, vi } from "vitest";
import { ExternalResultTextProvider, parseFormOutput } from "@/lib/results-ai/external-provider";
import { MockResultTextProvider } from "@/lib/results-ai/mock-provider";
import { buildResultUserContent } from "@/lib/results-ai/system-prompt";
import { checkResultText, numberReadings } from "@/lib/results-ai/text-guards";
import type {
  ResultFormRequest,
  ResultIndicatorFigures,
  ResultTextRequest,
  ResultTextUsage,
} from "@/lib/results-ai/types";
import type { ResponsesClient } from "@/lib/journey-ai/external-provider";
import {
  achievedSummary,
  computePercentage,
  formatPercentage,
  percentageErrors,
  suggestIndicatorKind,
} from "@/lib/results/indicator";
import { defaultFormSpec, resolveFormSpec } from "@/lib/results/form-spec";
import { indicatorSlots, plannedItems } from "@/lib/results/items";
import { buildPublicOrganization, buildPublicResults, publicPath } from "@/lib/results/public";
import { resultDataSchema, resultRecordActionSchema } from "@/lib/results/schemas";
import {
  afterApprove,
  afterDiscard,
  afterProposal,
  afterSave,
  allApproved,
  dataChanged,
  evaluationStatusFor,
  isApproved,
  resultsUnlocked,
} from "@/lib/results/status";
import { buildResultCard, synthesisReady, type ItemReference, type ResultRecordRow } from "@/lib/results/view";
import { activity, outcome, snapshot } from "./fixtures";

// ---------------------------------------------------------------------------
// Dados de exemplo (semiárido)
// ---------------------------------------------------------------------------

function request(
  overrides: Partial<ResultIndicatorFigures> = {},
  extra: Partial<ResultTextRequest> = {},
): ResultTextRequest {
  return {
    project: {
      name: "Sertão Verde",
      areaLabel: "Inclusão produtiva",
      targetAudience: "Famílias agricultoras",
      problem: "Baixa produção de alimentos nos quintais.",
      territory: "Ninheira (MG)",
      durationMonths: 12,
      strategy: "Formação técnica nos quintais e apoio à comercialização.",
    },
    level: "Resultado de médio prazo",
    logic: {
      contributesTo: ["Segurança alimentar das famílias"],
      builtOn: ["Realizar oficinas de manejo da água"],
      impact: "Segurança alimentar das famílias",
    },
    item: "Famílias aplicam conhecimentos de produção no semiárido em seus quintais",
    target: "Pelo menos 60% das famílias participantes",
    baseline: null,
    indicators: [
      {
        indicator: "Percentual de famílias que aplicam conhecimentos de produção no semiárido",
        kind: "PERCENTAGE",
        denominator: 32,
        numerator: 22,
        percentage: 68.8,
        achievedValue: null,
        unit: "famílias",
        achievedText: null,
        ...overrides,
      },
    ],
    teamPerception:
      "As famílias passaram a diversificar o plantio e utilizar melhor o espaço dos quintais. O manejo da água foi uma das práticas mais utilizadas.",
    additionalContext: "Persistiram dificuldades relacionadas ao controle de pragas no período de pouca chuva.",
    ...extra,
  };
}

const EXPECTED_TEXT =
  "Ao final do projeto, 22 das 32 famílias avaliadas demonstraram aplicação de conhecimentos sobre produção agrícola no semiárido em seus quintais, correspondendo a 68,8% do público acompanhado. A equipe observou maior diversificação do plantio e melhor aproveitamento dos espaços produtivos, com destaque para práticas de manejo da água. Permaneceram desafios relacionados ao controle de pragas durante o período de baixa precipitação.";

function row(overrides: Partial<ResultRecordRow> = {}): ResultRecordRow {
  return {
    id: "r1",
    sourceType: "OUTCOME",
    sourceId: "o1",
    order: 0,
    itemSnapshot: "Famílias aplicam conhecimentos de produção no semiárido",
    targetSnapshot: "Pelo menos 60% das famílias participantes",
    baselineSnapshot: null,
    verificationSnapshot: "Visitas técnicas",
    periodSnapshot: null,
    formSpec: null,
    indicators: [
      {
        id: "i1",
        order: 0,
        name: "Percentual de famílias que aplicam os conhecimentos",
        kind: "PERCENTAGE",
        denominator: 32,
        numerator: 22,
        achievedValue: null,
        unit: "famílias",
        achievedText: null,
      },
    ],
    teamPerception: "Diversificaram o plantio.",
    additionalContext: null,
    proposedText: null,
    proposalIsMock: false,
    approvedText: null,
    approvedAt: null,
    status: "DRAFT",
    ...overrides,
  };
}

/** Valida o dado de um único indicador. */
const one = (fields: Record<string, unknown>) =>
  resultDataSchema.parse({ indicators: [{ id: "i1", ...fields }] }).indicators[0];

// ---------------------------------------------------------------------------

describe("cálculo do percentual", () => {
  it("calcula com uma casa decimal, arredondando meio para cima", () => {
    expect(computePercentage(22, 32)).toBe(68.8);
    expect(computePercentage(1, 3)).toBe(33.3);
    expect(computePercentage(2, 3)).toBe(66.7);
    expect(computePercentage(0, 5)).toBe(0);
    expect(computePercentage(32, 32)).toBe(100);
  });

  it("formata no padrão brasileiro", () => {
    expect(formatPercentage(68.8)).toBe("68,8%");
    expect(formatPercentage(100)).toBe("100%");
    expect(
      achievedSummary({
        kind: "PERCENTAGE",
        numerator: 22,
        denominator: 32,
        achievedValue: null,
        unit: "famílias",
        achievedText: null,
      }),
    ).toBe("68,8% do total avaliado (22 de 32 famílias)");
  });

  it("não calcula com dados incompletos ou inválidos", () => {
    expect(computePercentage(null, 32)).toBeNull();
    expect(computePercentage(10, 0)).toBeNull();
    expect(computePercentage(40, 32)).toBeNull();
  });

  it("o percentual enviado pelo cliente é ignorado: o servidor recalcula", () => {
    const parsed = one({ kind: "PERCENTAGE", numerator: 22, denominator: 32, percentage: 99 });
    expect(parsed).not.toHaveProperty("percentage");
  });
});

describe("validação do indicador percentual", () => {
  it("bloqueia numerador maior que o denominador", () => {
    expect(percentageErrors(33, 32).numerator).toMatch(/não pode ser maior/);
    const result = resultDataSchema.safeParse({
      indicators: [{ id: "i1", kind: "PERCENTAGE", numerator: 33, denominator: 32 }],
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].path).toEqual(["indicators", 0, "numerator"]);
  });

  it("exige denominador maior que zero", () => {
    expect(percentageErrors(0, 0).denominator).toBeDefined();
    expect(
      resultDataSchema.safeParse({ indicators: [{ id: "i1", kind: "PERCENTAGE", numerator: 0, denominator: 0 }] })
        .success,
    ).toBe(false);
  });

  it("aceita rascunho incompleto e descarta campos de outros tipos", () => {
    const parsed = one({ kind: "COUNT", achievedValue: 120, numerator: 5, unit: "oficinas" });
    expect(parsed.numerator).toBeNull();
    expect(parsed.achievedValue).toBe(120);
    expect(one({ kind: "PERCENTAGE", denominator: 32 }).numerator).toBeNull();
  });
});

describe("tipo de indicador", () => {
  it("sugere o tipo sem depender só de palavras-chave fixas", () => {
    expect(suggestIndicatorKind("Percentual de famílias que aplicam", null)).toBe("PERCENTAGE");
    expect(suggestIndicatorKind("Famílias que aplicam as técnicas", "60% das famílias")).toBe("PERCENTAGE");
    expect(suggestIndicatorKind("Número de oficinas realizadas", null)).toBe("COUNT");
    expect(suggestIndicatorKind("Relato das lideranças sobre a articulação", null)).toBe("TEXT");
  });
});

describe("snapshot da Jornada", () => {
  const journey = snapshot({
    activities: [activity("a1", "realizar encontros de formação.")],
    outcomes: [
      outcome("o1", "famílias aplicam conhecimentos.", {
        target: "Pelo menos 60% das famílias",
        indicators: [{ name: "Percentual de famílias", explanation: null }],
        evidences: ["Visitas técnicas"],
      }),
    ],
    impact: {
      id: "i1",
      statement: "Segurança alimentar das famílias.",
      followUpOption: null,
      followUps: [
        {
          id: "f1",
          description: "Famílias mantêm a produção nos quintais",
          target: "50% das famílias",
          indicator: "Percentual de famílias produzindo",
          verification: "Visitas",
          periodAfterEnd: "12 meses após o fim",
          notes: null,
        },
      ],
    },
  });

  it("lista atividades, resultados e impacto, nessa ordem", () => {
    const items = plannedItems(journey);
    expect(items.map((i) => `${i.sourceType}:${i.sourceId}`)).toEqual(["ACTIVITY:a1", "OUTCOME:o1", "IMPACT:f1"]);
    expect(items[0].reference.item).toBe("Realizar encontros de formação");
    expect(items[0].reference.indicators).toEqual(["Número de encontros realizados"]);
    expect(items[2].reference.indicators).toEqual(["Percentual de famílias produzindo"]);
    expect(items[2].reference.period).toBe("12 meses após o fim");
  });

  it("copia resultado, meta, indicador e verificação aprovados", () => {
    expect(plannedItems(journey)[1].reference).toEqual({
      item: "Famílias aplicam conhecimentos",
      target: "Pelo menos 60% das famílias",
      indicators: ["Percentual de famílias"],
      baseline: null,
      verification: "Visitas técnicas",
      period: null,
    });
  });

  it("sem acompanhamentos, o próprio impacto recebe o registro", () => {
    const items = plannedItems(
      snapshot({ impact: { id: "i1", statement: "segurança alimentar.", followUpOption: null, followUps: [] } }),
    );
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      sourceType: "IMPACT",
      sourceId: "i1",
      reference: { item: "Segurança alimentar", indicators: [] },
    });
  });

  it("cada indicador aprovado recebe o seu dado alcançado", () => {
    const workshops = {
      ...activity("a1", "Realizar oficinas de reforço escolar"),
      indicators: [
        { name: "Número de oficinas realizadas", explanation: null },
        { name: "Número de crianças atendidas", explanation: null },
        { name: "Frequência de participação nas oficinas", explanation: null },
      ],
    };
    const [item] = plannedItems(snapshot({ activities: [workshops] }));
    expect(indicatorSlots(item.reference)).toEqual([
      "Número de oficinas realizadas",
      "Número de crianças atendidas",
      "Frequência de participação nas oficinas",
    ]);
    // Sem indicador aprovado: um único dado para o item.
    expect(indicatorSlots({ indicators: [] })).toEqual([null]);
  });

  it("preserva meta e indicador mesmo que a Jornada mude depois", () => {
    const live: ItemReference = {
      item: "Outro texto",
      target: "Pelo menos 80% das famílias",
      indicators: ["Novo indicador"],
      baseline: null,
      verification: null,
      period: null,
    };
    const card = buildResultCard(row(), 1, live);
    expect(card.label).toBe("Resultado 01");
    expect(card.reference.target).toBe("Pelo menos 60% das famílias participantes");
    expect(card.reference.indicators).toEqual(["Percentual de famílias que aplicam os conhecimentos"]);
    expect(card.reference.item).toBe("Famílias aplicam conhecimentos de produção no semiárido");
    expect(card.journeyChanged).toBe(true);
  });

  it("mantém o registro quando o item sai da Jornada", () => {
    const card = buildResultCard(row(), 1, null);
    expect(card.itemRemoved).toBe(true);
    expect(card.reference.target).toBe("Pelo menos 60% das famílias participantes");
  });

  it("conta quantos indicadores estão preenchidos", () => {
    const blank = {
      kind: null,
      denominator: null,
      numerator: null,
      achievedValue: null,
      unit: null,
      achievedText: null,
    };
    const card = buildResultCard(
      row({
        indicators: [
          row().indicators[0],
          { id: "i2", order: 1, name: "Número de oficinas", ...blank },
          { id: "i3", order: 2, name: "Frequência nas oficinas", ...blank },
        ],
      }),
      1,
      null,
    );
    expect(card.indicators.map((i) => i.name)).toEqual([
      "Percentual de famílias que aplicam os conhecimentos",
      "Número de oficinas",
      "Frequência nas oficinas",
    ]);
    expect(card.indicators[0].achievedSummary).toBe("68,8% do total avaliado (22 de 32 famílias)");
    expect(card.filledCount).toBe(1);
    expect(card.complete).toBe(false);
    expect(card.form.indicators).toHaveLength(3);
    expect(buildResultCard(row(), 1, null).complete).toBe(true);
  });

  it("a síntese depende só dos resultados de médio prazo", () => {
    const approved = { status: "APPROVED" as const, approvedText: "Texto." };
    const draft = { status: "DRAFT" as const, approvedText: null };
    expect(
      synthesisReady([
        { sourceType: "OUTCOME", ...approved },
        { sourceType: "ACTIVITY", ...draft },
      ]),
    ).toBe(true);
    expect(
      synthesisReady([
        { sourceType: "OUTCOME", ...draft },
        { sourceType: "IMPACT", ...approved },
      ]),
    ).toBe(false);
    expect(synthesisReady([{ sourceType: "ACTIVITY", ...approved }])).toBe(false);
  });
});

describe("formulário personalizado", () => {
  const ref = (overrides: Partial<ItemReference> = {}): ItemReference => ({
    item: "Famílias aplicam conhecimentos",
    target: "Pelo menos 60% das famílias",
    indicators: ["Percentual de famílias que aplicam"],
    baseline: null,
    verification: null,
    period: null,
    ...overrides,
  });
  const formRequest: ResultFormRequest = {
    project: request().project,
    items: [
      {
        id: "r1",
        sourceType: "OUTCOME",
        level: "Resultado de médio prazo",
        item: "Famílias aplicam",
        target: null,
        indicators: ["Percentual de famílias que aplicam"],
        period: null,
      },
    ],
  };
  const aiForm = { ...defaultFormSpec("OUTCOME", ref()), intro: "Conte quantas famílias aplicaram as técnicas." };
  /** Item como a OpenAI devolve (blocos em "indicadores"). */
  const ai = (overrides: Record<string, unknown> = {}) => {
    const { indicators, ...rest } = aiForm;
    return { id: "r1", ...rest, indicadores: indicators, ...overrides };
  };

  it("o padrão sugere o tipo de dado e usa texto para impacto sem indicador", () => {
    expect(defaultFormSpec("OUTCOME", ref()).indicators[0].kind).toBe("PERCENTAGE");
    expect(defaultFormSpec("IMPACT", ref({ target: null, indicators: [] })).indicators[0].kind).toBe("TEXT");
    const many = defaultFormSpec(
      "ACTIVITY",
      ref({ indicators: ["Número de oficinas realizadas", "Número de crianças"] }),
    );
    expect(many.indicators.map((i) => [i.kind, i.unit])).toEqual([
      ["COUNT", "oficinas"],
      ["COUNT", "crianças"],
    ]);
  });

  it("usa o formulário gravado quando válido; senão, o padrão", () => {
    expect(resolveFormSpec(aiForm, "OUTCOME", ref()).intro).toBe(aiForm.intro);
    expect(resolveFormSpec({ intro: "incompleto" }, "OUTCOME", ref())).toEqual(defaultFormSpec("OUTCOME", ref()));
    expect(resolveFormSpec(null, "OUTCOME", ref())).toEqual(defaultFormSpec("OUTCOME", ref()));
    // Faltou o bloco de um indicador: só ele usa o padrão.
    const two = ref({ indicators: ["Percentual de famílias que aplicam", "Número de visitas"] });
    const resolved = resolveFormSpec(aiForm, "OUTCOME", two);
    expect(resolved.indicators[0]).toEqual(aiForm.indicators[0]);
    expect(resolved.indicators[1]).toEqual(defaultFormSpec("OUTCOME", two).indicators[1]);
  });

  it("aceita só itens conhecidos, válidos e no alfabeto latino", () => {
    const output = JSON.stringify({ itens: [ai({ id: "r1" }), ai({ id: "desconhecido" })] });
    expect(parseFormOutput(output, formRequest)).toEqual({ r1: aiForm });
    const invalid = JSON.stringify({ itens: [ai({ indicadores: [{ ...aiForm.indicators[0], kind: "OUTRO" }] })] });
    expect(parseFormOutput(invalid, formRequest)).toEqual({});
    const foreign = JSON.stringify({ itens: [ai({ intro: "Опишите результат" })] });
    expect(parseFormOutput(foreign, formRequest)).toEqual({});
  });

  it("recusa formulário com número de blocos diferente do de indicadores", () => {
    const extra = JSON.stringify({ itens: [ai({ indicadores: [aiForm.indicators[0], aiForm.indicators[0]] })] });
    expect(parseFormOutput(extra, formRequest)).toEqual({});
  });

  it("o mock devolve o formulário padrão de cada item", async () => {
    const { forms } = await new MockResultTextProvider().generateForms(formRequest);
    expect(Object.keys(forms)).toEqual(["r1"]);
  });
});

describe("travas do texto da IA", () => {
  it("aceita o texto que preserva os números registrados", () => {
    expect(checkResultText(EXPECTED_TEXT, request())).toEqual({ ok: true, problems: [] });
  });

  it("recusa percentual alterado ou recalculado", () => {
    expect(checkResultText(EXPECTED_TEXT.replace("68,8%", "69%"), request()).ok).toBe(false);
    expect(checkResultText(EXPECTED_TEXT.replace("68,8%", "68,75%"), request()).ok).toBe(false);
  });

  it("recusa números registrados alterados ou omitidos", () => {
    expect(checkResultText(EXPECTED_TEXT.replace("22 das 32", "23 das 32"), request()).ok).toBe(false);
    expect(checkResultText(EXPECTED_TEXT.replace("22 das 32 famílias", "a maioria das famílias"), request()).ok).toBe(
      false,
    );
  });

  it("recusa números inventados", () => {
    const text = `${EXPECTED_TEXT} A renda das famílias cresceu 15%.`;
    const result = checkResultText(text, request());
    expect(result.ok).toBe(false);
    expect(result.problems.join(" ")).toMatch(/15/);
  });

  it("aceita números citados pela organização (ex.: a meta de 60%)", () => {
    expect(checkResultText(`${EXPECTED_TEXT} A meta prevista era de pelo menos 60% das famílias.`, request()).ok).toBe(
      true,
    );
  });

  it("recusa termos exagerados não sustentados pelos dados", () => {
    expect(checkResultText(`${EXPECTED_TEXT} O projeto transformou o território.`, request()).ok).toBe(false);
    expect(checkResultText(EXPECTED_TEXT.replace("demonstraram", "comprovaram"), request()).ok).toBe(false);
  });

  it("aceita termo forte quando ele está literalmente nos dados", () => {
    const req = request({}, { additionalContext: "A cisterna garantiu água no período seco." });
    expect(
      checkResultText(`${EXPECTED_TEXT} A organização registra que a cisterna garantiu água no período seco.`, req).ok,
    ).toBe(true);
  });

  it("interpreta números no formato brasileiro", () => {
    expect(numberReadings("68,8")).toEqual([68.8]);
    expect(numberReadings("1.200")).toEqual([1200, 1.2]);
    expect(numberReadings("1.200,5")).toEqual([1200.5]);
  });

  it("indicador numérico exige o valor alcançado intacto", () => {
    const req = request({
      kind: "COUNT",
      denominator: null,
      numerator: null,
      percentage: null,
      achievedValue: 1200,
      unit: "horas",
    });
    expect(checkResultText("Ao final do projeto, foram registradas 1.200 horas de formação.", req).ok).toBe(true);
    expect(checkResultText("Ao final do projeto, foram registradas 1.250 horas de formação.", req).ok).toBe(false);
  });

  it("com vários indicadores, exige o dado de todos", () => {
    const req = request({}, { indicators: [...request().indicators, workshopsFigures] });
    const both = `${EXPECTED_TEXT} Foram realizadas 48 oficinas.`;
    expect(checkResultText(both, req)).toEqual({ ok: true, problems: [] });
    const result = checkResultText(EXPECTED_TEXT, req);
    expect(result.ok).toBe(false);
    expect(result.problems.join(" ")).toMatch(/48/);
  });
});

const workshopsFigures: ResultIndicatorFigures = {
  indicator: "Número de oficinas realizadas",
  kind: "COUNT",
  denominator: null,
  numerator: null,
  percentage: null,
  achievedValue: 48,
  unit: "oficinas",
  achievedText: null,
};

describe("provedores do texto técnico", () => {
  it("o mock preserva os números em todos os tipos", async () => {
    const mock = new MockResultTextProvider();
    const cases = [
      request(),
      request({
        kind: "COUNT",
        denominator: null,
        numerator: null,
        percentage: null,
        achievedValue: 48,
        unit: "oficinas",
      }),
      request({
        kind: "TEXT",
        denominator: null,
        numerator: null,
        percentage: null,
        unit: null,
        achievedText: "As lideranças criaram uma comissão local.",
      }),
      request({}, { indicators: [...request().indicators, workshopsFigures] }),
    ];
    for (const req of cases) {
      const { text } = await mock.organize(req);
      expect(checkResultText(text, req)).toEqual({ ok: true, problems: [] });
    }
    expect((await mock.organize(request())).text).toContain("68,8%");
  });

  it("envia a lógica do projeto e o dado sem rótulos internos", () => {
    const content = JSON.parse(buildResultUserContent(request({}, { indicators: [workshopsFigures] })));
    expect(content.logicaDoProjeto.contribuiPara).toEqual(["Segurança alimentar das famílias"]);
    expect(content.projeto.strategy).toMatch(/Formação técnica/);
    expect(content.indicadores[0].dadoRegistrado).toBe("48 oficinas");
    expect(JSON.stringify(content)).not.toMatch(/Valor alcançado/);
  });

  it("envia à IA só os campos previstos (sem meio de verificação)", () => {
    const content = buildResultUserContent(request());
    expect(content).toContain("68,8%");
    expect(content).not.toMatch(/verifica/i);
  });

  function external(outputText: string) {
    const usage: ResultTextUsage[] = [];
    const create = vi.fn(async () => ({
      status: "completed",
      output: [],
      output_text: outputText,
      usage: { input_tokens: 50, output_tokens: 30 },
    }));
    const provider = new ExternalResultTextProvider(
      { apiKey: "sk-teste-nao-usar", model: "modelo-teste", timeoutMs: 1000 },
      { client: { responses: { create } } as unknown as ResponsesClient, recordUsage: async (u) => void usage.push(u) },
    );
    return { provider, usage, create };
  }

  it("aceita a resposta da OpenAI que preserva os números", async () => {
    const { provider, usage } = external(JSON.stringify({ texto: EXPECTED_TEXT }));
    await expect(provider.organize(request())).resolves.toEqual({ text: EXPECTED_TEXT });
    expect(usage[0].status).toBe("SUCCESS");
  });

  it("descarta a resposta da OpenAI que altera os números", async () => {
    const { provider, usage } = external(JSON.stringify({ texto: EXPECTED_TEXT.replace("68,8%", "70%") }));
    await expect(provider.organize(request())).rejects.toMatchObject({ status: "INVALID_RESPONSE" });
    expect(usage[0].status).toBe("INVALID_RESPONSE");
  });
});

describe("status dos resultados", () => {
  const approved = afterApprove("Texto aprovado.");

  it("rascunho e proposta da IA nunca contam como aprovados", () => {
    expect(isApproved({ status: "DRAFT", approvedText: null })).toBe(false);
    expect(isApproved(afterProposal({ status: "DRAFT", proposedText: null, approvedText: null }, "Proposta"))).toBe(
      false,
    );
    // Mesmo com um texto aprovado antigo guardado, o status DRAFT não é aprovado.
    expect(isApproved({ status: "DRAFT", approvedText: "Texto antigo" })).toBe(false);
    expect(allApproved([approved, { status: "DRAFT", approvedText: null }])).toBe(false);
    expect(allApproved([])).toBe(false);
  });

  it("alterar os dados registrados invalida o texto aprovado", () => {
    const next = afterSave(approved, true);
    expect(next).toEqual({ status: "DRAFT", proposedText: null, approvedText: null });
    expect(afterSave(approved, false)).toBe(approved);
  });

  it("nova versão da IA fica pendente; descartar volta ao texto aprovado", () => {
    const proposed = afterProposal(approved, "Nova versão");
    expect(proposed.status).toBe("AI_PROPOSED");
    expect(isApproved(proposed)).toBe(false);
    expect(afterDiscard(proposed)).toEqual({ status: "APPROVED", proposedText: null, approvedText: "Texto aprovado." });
    expect(afterDiscard(afterProposal({ status: "DRAFT", proposedText: null, approvedText: null }, "x")).status).toBe(
      "DRAFT",
    );
  });

  it("detecta mudanças nos dados", () => {
    const workshops = {
      id: "i1",
      kind: "COUNT" as const,
      denominator: null,
      numerator: null,
      achievedValue: 10,
      unit: "oficinas",
      achievedText: null,
    };
    const base = { indicators: [workshops], teamPerception: null, additionalContext: null };
    expect(dataChanged(base, { ...base, indicators: [{ ...workshops }] })).toBe(false);
    expect(dataChanged(base, { ...base, indicators: [{ ...workshops, achievedValue: 11 }] })).toBe(true);
    expect(dataChanged(base, { ...base, teamPerception: "Nova percepção." })).toBe(true);
  });

  it("a avaliação só fica concluída com todos os textos aprovados", () => {
    expect(evaluationStatusFor("DRAFT", [{ status: "DRAFT", approvedText: null }])).toBe("DRAFT");
    expect(evaluationStatusFor("DRAFT", [approved, { status: "DRAFT", approvedText: null }])).toBe("IN_PROGRESS");
    expect(evaluationStatusFor("COMPLETED", [approved])).toBe("COMPLETED");
    expect(evaluationStatusFor("COMPLETED", [approved, { status: "AI_PROPOSED", approvedText: null }])).toBe(
      "IN_PROGRESS",
    );
  });

  it("aprovar exige texto", () => {
    expect(resultRecordActionSchema.safeParse({ action: "approve", text: "   " }).success).toBe(false);
  });
});

describe("acesso à área de Resultados", () => {
  it("fica bloqueada enquanto a Jornada não estiver aprovada", () => {
    expect(resultsUnlocked([])).toBe(false);
    expect(resultsUnlocked(["CONTEXT", "ACTIVITIES", "OUTCOMES"])).toBe(false);
    expect(resultsUnlocked(["CONTEXT", "ACTIVITIES", "OUTCOMES", "IMPACT"])).toBe(true);
  });
});

describe("página pública", () => {
  const organization = { id: "org1", name: "Organização Teste" };
  const project = {
    id: "p1",
    name: "Sertão Verde",
    areaLabel: "Inclusão produtiva",
    territory: "Ninheira (MG)",
    targetAudience: "Famílias agricultoras",
    duration: "12 meses",
    problem: "Baixa produção de alimentos.",
    impact: "Segurança alimentar das famílias",
  };
  const base = {
    organization,
    project,
    journeyConcluded: true,
    evaluationStatus: "IN_PROGRESS" as const,
    completedAt: null,
  };
  const approved = buildResultCard(
    row({
      status: "APPROVED",
      approvedText: "Texto aprovado.",
      teamPerception: "Percepção interna da equipe.",
      additionalContext: "Contexto interno.",
    }),
    1,
    null,
  );
  const workshops = buildResultCard(
    row({
      id: "r2",
      sourceType: "ACTIVITY",
      sourceId: "a1",
      status: "AI_PROPOSED",
      proposedText: "Proposta da IA.",
      indicators: [
        {
          id: "i9",
          order: 0,
          name: "Número de oficinas realizadas",
          kind: "COUNT",
          denominator: null,
          numerator: null,
          achievedValue: 48,
          unit: "oficinas",
          achievedText: null,
        },
      ],
    }),
    1,
    null,
  );
  const blank = { kind: null, denominator: null, numerator: null, achievedValue: null, unit: null, achievedText: null };
  const empty = buildResultCard(
    row({
      id: "r3",
      sourceType: "IMPACT",
      sourceId: "f1",
      indicators: [{ id: "i3", order: 0, name: "Renda", ...blank }],
    }),
    1,
    null,
  );

  it("mostra itens com dado registrado; o texto só quando aprovado", () => {
    const view = buildPublicResults({ ...base, cards: [workshops, approved, empty] });
    expect(view.sections.map((s) => s.type)).toEqual(["ACTIVITY", "OUTCOME"]);
    expect(view.sections[0].items[0]).toMatchObject({ label: "Atividade 01", text: null });
    expect(view.sections[1].items[0]).toMatchObject({ label: "Resultado 01", text: "Texto aprovado." });
  });

  it("nunca expõe propostas da IA, percepção, contexto ou meios de verificação", () => {
    const json = JSON.stringify(buildPublicResults({ ...base, cards: [workshops, approved, empty] }));
    for (const secret of ["Percepção interna", "Contexto interno", "Proposta da IA", "Visitas técnicas"]) {
      expect(json).not.toContain(secret);
    }
  });

  it("destaca primeiro a mudança no público e depois a entrega", () => {
    const { highlights } = buildPublicResults({ ...base, cards: [workshops, approved] });
    expect(highlights).toEqual([
      {
        value: "68,8%",
        label: "Percentual de famílias que aplicam os conhecimentos",
        detail: "22 de 32 famílias",
        percentage: 68.8,
      },
      { value: "48", label: "Número de oficinas realizadas", detail: "oficinas", percentage: null },
    ]);
  });

  it("informa o estágio do projeto", () => {
    expect(buildPublicResults({ ...base, journeyConcluded: false, evaluationStatus: null, cards: [] }).stage).toBe(
      "PLANNING",
    );
    expect(buildPublicResults({ ...base, cards: [] }).stage).toBe("RECORDING");
    const done = buildPublicResults({ ...base, evaluationStatus: "COMPLETED", completedAt: "2026-10-23", cards: [] });
    expect(done).toMatchObject({ stage: "COMPLETED", completedAt: "2026-10-23" });
  });

  it("a vitrine põe primeiro os projetos com resultados", () => {
    const planning = buildPublicResults({
      ...base,
      project: { ...project, id: "p2", name: "A Primeira em ordem alfabética" },
      journeyConcluded: false,
      evaluationStatus: null,
      cards: [],
    });
    const recording = buildPublicResults({ ...base, cards: [workshops, approved] });
    const view = buildPublicOrganization(organization, [planning, recording]);
    expect(view.projects.map((p) => [p.project.id, p.itemsWithResults])).toEqual([
      ["p1", 2],
      ["p2", 0],
    ]);
    expect(view.projects[0].highlights.length).toBeLessThanOrEqual(3);
  });

  it("monta os links públicos", () => {
    expect(publicPath("org1")).toBe("/publico/org1");
    expect(publicPath("org1", "p1")).toBe("/publico/org1/p1");
  });
});
