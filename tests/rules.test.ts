import { describe, expect, it } from "vitest";
import {
  assessActivityDescription,
  detectSensitiveData,
  findAbstractOutcomeTerms,
  findExclusiveCausalityTerms,
  findUnsupportedOutcomeDependency,
  isActivityOnlyEvidence,
  isToDefine,
} from "@/lib/journey/rules";

describe("atividades: ação concreta x intenção", () => {
  it.each([
    "conscientizar jovens",
    "Conscientizar jovens sobre o meio ambiente",
    "sensibilizar a comunidade para a importância da leitura",
    "promover a conscientização ambiental",
    "fortalecer a autoestima das mulheres",
  ])("recusa objetivo abstrato: %s", (text) => {
    const result = assessActivityDescription(text);
    expect(result.ok).toBe(false);
  });

  it("explica que conscientizar é intenção e pede a ação concreta", () => {
    const result = assessActivityDescription("conscientizar jovens");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/intenção/);
  });

  it.each([
    "Realizar capacitações técnicas sobre produção agrícola adaptada ao semiárido",
    "ofertar oficinas de leitura para crianças",
    "Fornecer mudas e sementes às famílias",
    "promover encontros mensais com as famílias",
    "apoiar a comercialização em feiras locais",
    "oficinas de conscientização ambiental com jovens",
    "Produzir cartilhas sobre manejo do solo",
  ])("aceita ação concreta: %s", (text) => {
    expect(assessActivityDescription(text)).toEqual({ ok: true });
  });

  it("recusa descrição curta demais", () => {
    expect(assessActivityDescription("feira").ok).toBe(false);
  });
});

describe("mudanças esperadas", () => {
  it("detecta termos abstratos sem explicação observável", () => {
    expect(findAbstractOutcomeTerms("jovens mais conscientes sobre o lixo")).not.toHaveLength(0);
    expect(findAbstractOutcomeTerms("mulheres com mais autoestima")).not.toHaveLength(0);
    expect(findAbstractOutcomeTerms("famílias passem a utilizar canais de venda")).toHaveLength(0);
  });

  it("não aceita inserção no mercado de trabalho só com formação", () => {
    const message = findUnsupportedOutcomeDependency("jovens inseridos no mercado de trabalho", [
      "Ofertar curso de informática para jovens",
    ]);
    expect(message).toMatch(/encaminhamento/);
  });

  it("aceita inserção no mercado quando há encaminhamento ou articulação com empregadores", () => {
    expect(
      findUnsupportedOutcomeDependency("jovens conquistem o primeiro emprego", [
        "Ofertar curso de informática",
        "Realizar encaminhamento dos egressos para vagas em empresas parceiras",
      ]),
    ).toBeNull();
  });

  it("foto, lista de presença e relatório de execução não comprovam mudança", () => {
    expect(isActivityOnlyEvidence("Lista de presença")).toBe(true);
    expect(isActivityOnlyEvidence("Registro fotográfico e lista de presença")).toBe(true);
    expect(isActivityOnlyEvidence("Relatório de execução")).toBe(true);
    expect(isActivityOnlyEvidence("Relatório de evolução das famílias")).toBe(false);
    expect(isActivityOnlyEvidence("Lista de presença e questionário de acompanhamento")).toBe(false);
  });
});

describe("impacto de longo prazo", () => {
  it("sinaliza promessa de causalidade exclusiva", () => {
    expect(findExclusiveCausalityTerms("Erradicar a fome no município")).not.toHaveLength(0);
    expect(findExclusiveCausalityTerms("Acabar com a pobreza rural")).not.toHaveLength(0);
    expect(findExclusiveCausalityTerms("Contribuir para a segurança alimentar das famílias")).toHaveLength(0);
  });
});

describe("dados pessoais", () => {
  it.each([
    ["CPF 123.456.789-00", "CPF"],
    ["meu telefone é (38) 99999-1234", "TELEFONE"],
    ["escreva para maria@exemplo.com", "EMAIL"],
  ])("detecta %s", (text, kind) => {
    expect(detectSensitiveData(text)).toContain(kind);
  });

  it("não confunde metas numéricas com dados pessoais", () => {
    expect(detectSensitiveData("12 encontros com 40 famílias até 2026, 60% das famílias")).toEqual([]);
  });
});

describe("a definir", () => {
  it("trata vazio e 'a definir' como lacuna", () => {
    expect(isToDefine(null)).toBe(true);
    expect(isToDefine("  ")).toBe(true);
    expect(isToDefine("A definir")).toBe(true);
    expect(isToDefine("60% das famílias")).toBe(false);
  });
});
