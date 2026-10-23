import { describe, expect, it } from "vitest";
import { activityLines, outcomeLines, reportStrategyText } from "@/lib/journey/format";
import { consolidateEvidencePlan, outcomeNextStep, stageApprovalBlockers } from "@/lib/journey/progress";
import { checkProposal } from "@/lib/journey/proposal-rules";
import { activity, outcome, snapshot } from "./fixtures";

describe("aprovação de etapas", () => {
  it("bloqueia etapa sem etapas anteriores aprovadas", () => {
    const blockers = stageApprovalBlockers(snapshot({ activities: [activity("a1", "Realizar oficinas")] }), "ACTIVITIES");
    expect(blockers.join(" ")).toMatch(/Contexto/);
  });

  it("exige atividade completa para aprovar a etapa 2", () => {
    const snap = snapshot({ approved: ["CONTEXT"], activities: [activity("a1", "Realizar oficinas", false)] });
    expect(stageApprovalBlockers(snap, "ACTIVITIES")).toHaveLength(1);
    const ok = snapshot({ approved: ["CONTEXT"], activities: [activity("a1", "Realizar oficinas")] });
    expect(stageApprovalBlockers(ok, "ACTIVITIES")).toEqual([]);
  });

  it("resultado só fica completo com meta, indicador e verificação", () => {
    const o = outcome("o1", "as famílias ampliem a produção");
    expect(outcomeNextStep(o)).toBe("TARGET");
    expect(outcomeNextStep({ ...o, target: "60% das famílias" })).toBe("INDICATOR");
    expect(outcomeNextStep({ ...o, target: "60%", indicators: [{ name: "x", explanation: null }], evidences: ["y"] })).toBeNull();
  });

  it("impacto exige opção de acompanhamento", () => {
    const snap = snapshot({
      approved: ["CONTEXT", "ACTIVITIES", "OUTCOMES"],
      impact: { id: "i1", statement: "Contribuir para...", followUpOption: null, followUps: [] },
    });
    expect(stageApprovalBlockers(snap, "IMPACT").join(" ")).toMatch(/acompanhado/);
  });
});

describe("regras aplicadas às propostas", () => {
  const base = snapshot({ approved: ["CONTEXT", "ACTIVITIES"], activities: [activity("a1", "Ofertar curso de informática")] });

  it("limita a três mudanças sem solicitação expressa", () => {
    const outcomes = Array.from({ length: 4 }, (_, i) => ({ statement: `as famílias passem a utilizar o canal ${i}`, relatedActivityIds: ["a1"] }));
    const issues = checkProposal({ type: "OUTCOME", payload: { step: "STATEMENTS", outcomes, explicitRequestForMore: false } }, base);
    expect(issues.some((i) => i.field === "outcomes")).toBe(true);
    const allowed = checkProposal({ type: "OUTCOME", payload: { step: "STATEMENTS", outcomes, explicitRequestForMore: true } }, base);
    expect(allowed.some((i) => i.field === "outcomes")).toBe(false);
  });

  it("recusa mudança que depende de ação não realizada", () => {
    const issues = checkProposal(
      {
        type: "OUTCOME",
        payload: {
          step: "STATEMENTS",
          outcomes: [{ statement: "os jovens sejam inseridos no mercado de trabalho", relatedActivityIds: ["a1"] }],
          explicitRequestForMore: false,
        },
      },
      base,
    );
    expect(issues).toHaveLength(1);
  });

  it("recusa atividade inexistente relacionada à mudança", () => {
    const issues = checkProposal(
      {
        type: "OUTCOME",
        payload: { step: "STATEMENTS", outcomes: [{ statement: "as famílias ampliem a produção", relatedActivityIds: ["zzz"] }], explicitRequestForMore: false },
      },
      base,
    );
    expect(issues).toHaveLength(1);
  });

  it("não aceita indicador antes da meta nem lista de presença como verificação de mudança", () => {
    const snap = snapshot({ approved: ["CONTEXT", "ACTIVITIES"], activities: base.activities, outcomes: [outcome("o1", "as famílias ampliem a produção")] });
    const issues = checkProposal(
      { type: "OUTCOME", payload: { step: "INDICATOR", outcomeId: "o1", indicators: [{ name: "x", explanation: null }], verification: "Lista de presença" } },
      snap,
    );
    expect(issues.map((i) => i.field).sort()).toEqual(["outcomeId", "verification"]);
  });

  it("recusa atividade abstrata mesmo vinda de edição", () => {
    const issues = checkProposal(
      {
        type: "ACTIVITY",
        payload: {
          description: "conscientizar jovens",
          target: { description: "a definir", deadline: null, quantity: null, unit: null, durationMonths: null, period: null },
          indicators: [{ name: "x", explanation: null }],
          evidences: [{ description: "y" }],
        },
      },
      base,
    );
    expect(issues).toHaveLength(1);
  });
});

describe("plano de evidências", () => {
  it("consolida o que foi aprovado sem inventar responsável", () => {
    const snap = snapshot({
      activities: [activity("a1", "Realizar oficinas")],
      outcomes: [
        outcome("o1", "as famílias ampliem a produção", {
          target: "60% das famílias",
          indicators: [{ name: "Percentual de famílias", explanation: null }],
          evidences: ["Relatório de evolução das famílias"],
        }),
      ],
      impact: {
        id: "i1",
        statement: "Contribuir para...",
        followUpOption: "VISION_ONLY",
        followUps: [],
      },
    });
    const plan = consolidateEvidencePlan(snap);
    expect(plan).toHaveLength(2);
    expect(plan.every((i) => i.responsible === null)).toBe(true);
    expect(plan[1]).toMatchObject({ target: "60% das famílias", verification: "Relatório de evolução das famílias" });
  });
});

describe("formatos do relatório", () => {
  it("usa a estrutura exata de atividade e resultado", () => {
    expect(activityLines(activity("a1", "realizar oficinas.")).map(([k]) => k)).toEqual(["Atividade", "Meta", "Indicadores", "Meio de verificação"]);
    const o = outcome("o1", "as famílias ampliem a produção", { target: "60%", indicators: [{ name: "x", explanation: null }], evidences: ["y"] });
    expect(outcomeLines(o).map(([k]) => k)).toEqual(["Resultado", "Meta", "Indicador", "Meio de verificação"]);
  });

  it("sem estratégia registrada, o texto é construído a partir das atividades", () => {
    expect(reportStrategyText(null, [{ description: "Realizar oficinas." }, { description: "Fornecer mudas." }])).toBe(
      "Para enfrentar essa situação, a equipe vai realizar oficinas e fornecer mudas.",
    );
    expect(reportStrategyText(null, [])).toBeNull();
  });

  it("estratégia conecta as ações sem enumeração automática", () => {
    const text = reportStrategyText("combinar formação e comercialização", [
      { description: "Realizar capacitações técnicas." },
      { description: "Apoiar feiras locais." },
    ]);
    expect(text).toBe("Combinar formação e comercialização. Na prática, a equipe vai realizar capacitações técnicas e apoiar feiras locais.");
  });
});
