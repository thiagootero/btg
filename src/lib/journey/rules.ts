/**
 * Regras metodológicas da Jornada de Impacto aplicadas no servidor.
 *
 * Estas validações NÃO dependem do prompt da IA: qualquer proposta (do mock,
 * de um provedor externo ou editada pela pessoa) passa por elas antes de ser
 * gravada.
 */

export const TO_DEFINE = "a definir";

/** Limite padrão de mudanças prioritárias de médio prazo. */
export const MAX_OUTCOMES = 3;
/** Limite quando a organização solicita expressamente mais mudanças. */
export const MAX_OUTCOMES_WITH_EXPLICIT_REQUEST = 6;

export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function isToDefine(value: string | null | undefined): boolean {
  if (!value) return true;
  const n = normalize(value);
  return n === "" || n === "a definir" || n === "-" || n === "nao definido";
}

function includesAny(text: string, terms: readonly string[]): string[] {
  const n = normalize(text);
  return terms.filter((t) => n.includes(t));
}

// ---------------------------------------------------------------------------
// Atividades
// ---------------------------------------------------------------------------

/** Verbos (início de palavra) que indicam ação concreta realizada pela equipe. */
const CONCRETE_ACTIVITY_VERBS = [
  "ofert", "oferec", "realiz", "fornec", "distribu", "produz", "elabor", "criar", "implant",
  "instal", "constru", "organiz", "apoi", "visit", "atend", "acompanh", "assessor", "mentor",
  "capacit", "formar", "ministr", "conduz", "entreg", "disponibiliz", "articul", "encaminh",
  "mobiliz", "contrat", "adquir", "doar", "ensin", "trein", "execut", "orient", "facilit",
  "mapear", "estrutur", "equip", "reform", "lanc", "publica", "divulg", "sediar", "receb",
] as const;

/** Substantivos que indicam algo concreto ofertado pelo projeto. */
const CONCRETE_ACTIVITY_NOUNS = [
  "oficina", "curso", "aula", "encontro", "reuniao", "palestra", "evento", "feira", "muda",
  "semente", "insumo", "kit", "material", "cartilha", "aplicativo", "plataforma", "visita",
  "atendimento", "capacitac", "formac", "mentoria", "assessoria", "consultoria", "roda de conversa",
  "campeonato", "torneio", "treino", "ponto de venda", "pontos de venda", "espetaculo", "exposic",
  "apresentac", "biblioteca", "reforco", "tutoria", "intercambio", "seminario", "workshop",
  "comercializac",
] as const;

/** Termos que descrevem intenção/objetivo, não uma ação da equipe. */
const ABSTRACT_ACTIVITY_MARKERS = [
  "conscientiz", "sensibiliz", "empoder", "transform", "melhor", "fortalec", "despert", "garant",
  "contribu", "combat", "reduz", "erradic", "valoriz", "resgat", "estimul", "incentiv", "inspir",
  "motiv", "mudar", "elevar", "aument", "ampli", "autoestima", "cidadania", "protagonismo",
] as const;

function wordStarts(n: string, stems: readonly string[]): boolean {
  const words = n.split(/[^a-z0-9]+/).filter(Boolean);
  return stems.some((stem) => words.some((w) => w.startsWith(stem)));
}

export type ActivityAssessment =
  | { ok: true }
  | { ok: false; reason: "TOO_SHORT" | "ABSTRACT" | "UNCLEAR"; message: string };

/**
 * Uma atividade é uma ação concreta da equipe (ofertar formação, realizar
 * visitas, fornecer insumos...). Objetivos como "conscientizar jovens" são
 * intenções e não são aceitos como atividade.
 */
export function assessActivityDescription(text: string): ActivityAssessment {
  const n = normalize(text);
  if (n.length < 8 || n.split(" ").length < 2) {
    return {
      ok: false,
      reason: "TOO_SHORT",
      message: "Descreva a atividade com um pouco mais de detalhe: qual ação a equipe vai realizar e com quem.",
    };
  }
  const firstWord = n.split(" ")[0] ?? "";
  const startsWithConcreteVerb = CONCRETE_ACTIVITY_VERBS.some((v) => firstWord.startsWith(v));
  const hasConcreteVerb = wordStarts(n, CONCRETE_ACTIVITY_VERBS);
  const hasConcreteNoun = CONCRETE_ACTIVITY_NOUNS.some((m) => n.includes(m));
  const hasAbstract = wordStarts(n, ABSTRACT_ACTIVITY_MARKERS);

  if (hasAbstract && !startsWithConcreteVerb && !hasConcreteNoun) {
    return {
      ok: false,
      reason: "ABSTRACT",
      message:
        "Isso descreve uma intenção do projeto, não uma atividade. Qual ação concreta a equipe vai realizar para chegar lá? Por exemplo: ofertar oficinas, realizar visitas, fornecer insumos, produzir materiais ou promover encontros.",
    };
  }
  if (!hasConcreteVerb && !hasConcreteNoun) {
    return {
      ok: false,
      reason: "UNCLEAR",
      message:
        "Não ficou claro qual ação a equipe vai realizar. Descreva o que será feito na prática, como ofertar formações, realizar visitas, fornecer insumos ou promover encontros.",
    };
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Mudanças esperadas (resultados)
// ---------------------------------------------------------------------------

const ABSTRACT_OUTCOME_TERMS = [
  "mais conscientes", "mais consciente", "conscientizad", "mais capacitad", "capacitados",
  "capacitadas", "autoestima", "auto-estima", "empoderad", "mais informad", "sensibilizad",
] as const;

/** Termos abstratos sem explicação observável. */
export function findAbstractOutcomeTerms(text: string): string[] {
  return includesAny(text, ABSTRACT_OUTCOME_TERMS);
}

const EMPLOYMENT_TERMS = [
  "mercado de trabalho", "emprego", "empregad", "insercao profissional", "inseridos no mercado",
  "contratad", "vaga de trabalho", "primeiro trabalho",
] as const;

const EMPLOYMENT_SUPPORT_TERMS = [
  "encaminh", "articulac", "empregador", "empresas parceiras", "empresa parceira",
  "acompanhamento de egressos", "acompanhar egressos", "intermediac", "banco de vagas",
  "processo seletivo", "estagio",
] as const;

/**
 * Detecta mudanças que dependem de ações que o projeto não realiza. Hoje cobre
 * o caso clássico: formação apresentada como inserção no mercado de trabalho
 * sem encaminhamento, articulação com empregadores ou acompanhamento de egressos.
 */
export function findUnsupportedOutcomeDependency(
  outcomeText: string,
  activityTexts: string[],
): string | null {
  if (includesAny(outcomeText, EMPLOYMENT_TERMS).length === 0) return null;
  const supported = activityTexts.some((a) => includesAny(a, EMPLOYMENT_SUPPORT_TERMS).length > 0);
  if (supported) return null;
  return "Esta mudança depende de inserção no mercado de trabalho, mas nenhuma atividade aprovada prevê encaminhamento, articulação com empregadores ou acompanhamento de egressos. Ajuste a mudança ou acrescente a atividade correspondente.";
}

const ACTIVITY_ONLY_EVIDENCE = [
  "foto", "fotograf", "lista de presenca", "listas de presenca", "relatorio de execucao",
  "relatorio de atividades", "registro de atividades", "relatorio de realizacao", "video",
] as const;

/**
 * Foto, lista de presença ou relatório de execução comprovam a atividade, mas
 * não bastam para comprovar mudança na vida das pessoas.
 */
export function isActivityOnlyEvidence(verification: string): boolean {
  const parts = normalize(verification)
    .split(/,|;|\/|\be\b|\+/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) return false;
  return parts.every((p) => ACTIVITY_ONLY_EVIDENCE.some((t) => p.includes(t)));
}

// ---------------------------------------------------------------------------
// Impacto de longo prazo
// ---------------------------------------------------------------------------

const EXCLUSIVE_CAUSALITY_TERMS = [
  "erradicar", "erradicacao", "acabar com", "eliminar", "zerar", "resolver o problema",
  "resolver a", "resolver o", "garantir que todos", "garantir que todas", "por completo",
  "definitivamente",
] as const;

/** O impacto deve ser formulado como contribuição, não como promessa exclusiva. */
export function findExclusiveCausalityTerms(text: string): string[] {
  return includesAny(text, EXCLUSIVE_CAUSALITY_TERMS);
}

// ---------------------------------------------------------------------------
// Dados pessoais
// ---------------------------------------------------------------------------

export type SensitiveDataKind = "CPF" | "TELEFONE" | "EMAIL" | "RG" | "NIS";

const SENSITIVE_PATTERNS: Array<[SensitiveDataKind, RegExp]> = [
  ["CPF", /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/],
  ["CPF", /\bcpf\b\D{0,10}\d{11}\b/i],
  ["TELEFONE", /(?:\(\d{2}\)\s?|\b\d{2}\s)9?\d{4}[-\s]?\d{4}\b/],
  ["TELEFONE", /\b9\d{4}-\d{4}\b/],
  ["EMAIL", /[\w.+-]+@[\w-]+\.[\w.-]+/],
  ["RG", /\brg\b\D{0,10}[\d.\-xX]{7,}/i],
  ["NIS", /\b(?:nis|pis)\b\D{0,10}\d{11}\b/i],
];

/**
 * Nesta versão a mensuração é agregada por projeto: o chat e as fichas não
 * devem guardar dados pessoais de participantes.
 */
export function detectSensitiveData(text: string): SensitiveDataKind[] {
  const found = new Set<SensitiveDataKind>();
  for (const [kind, pattern] of SENSITIVE_PATTERNS) {
    if (pattern.test(text)) found.add(kind);
  }
  return [...found];
}

export const SENSITIVE_DATA_MESSAGE =
  "Parece que a mensagem contém dados pessoais (como CPF, telefone ou e-mail). Nesta versão trabalhamos apenas com informações agregadas do projeto. Remova esses dados e envie novamente.";
