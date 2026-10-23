/**
 * Heurísticas determinísticas usadas pelo MockJourneyAIProvider.
 *
 * Servem apenas para demonstrar a interface e as transições de etapa sem uma
 * API de IA. Nunca inventam números, percentuais ou metas:
 * esses dados vêm sempre da pessoa usuária.
 */
import { joinPt, lowerFirst, stripTrailingPeriod, upperFirst } from "@/lib/journey/format";
import { normalize } from "@/lib/journey/rules";
import type { ActivityPayload, ActivityPeriod } from "@/lib/journey/proposal-schemas";
import type { ActivityView } from "@/lib/journey/types";

// ---------------------------------------------------------------------------
// Público
// ---------------------------------------------------------------------------

const AUDIENCE_PATTERNS: Array<[RegExp, string, string]> = [
  // [padrão, forma curta (sujeito plural), unidade para metas]
  [/famil/, "as famílias participantes", "famílias"],
  [/agricult/, "os agricultores participantes", "agricultores"],
  [/mulher/, "as mulheres participantes", "mulheres"],
  [/jove|adolesc/, "os jovens participantes", "jovens"],
  [/crianc/, "as crianças participantes", "crianças"],
  [/estudant|alun/, "os estudantes participantes", "estudantes"],
  [/idos/, "as pessoas idosas participantes", "pessoas"],
  [/atleta/, "os atletas participantes", "atletas"],
  [/empreendedor/, "os empreendedores participantes", "empreendedores"],
  [/professor|educador/, "os educadores participantes", "educadores"],
];

export function audienceShort(targetAudience: string): { subject: string; unit: string } {
  const n = normalize(targetAudience);
  for (const [pattern, subject, unit] of AUDIENCE_PATTERNS) {
    if (pattern.test(n)) return { subject, unit };
  }
  return { subject: "as pessoas participantes", unit: "pessoas" };
}

// ---------------------------------------------------------------------------
// Atividades
// ---------------------------------------------------------------------------

/** Formula a atividade como ação: "oficinas de X" → "Realizar oficinas de X." */
export function formulateActivity(text: string): string {
  const clean = stripTrailingPeriod(text.replace(/\s+/g, " "));
  const firstWord = normalize(clean.split(" ")[0] ?? "");
  const isInfinitive = /(ar|er|ir|or)$/.test(firstWord);
  const body = isInfinitive ? upperFirst(clean) : `Realizar ${lowerFirst(clean)}`;
  return `${body}.`;
}

type ActivityTheme = "SALES_POINT" | "APP" | "FAIR" | "SUPPLIES" | "TRAINING" | "VISITS" | "MATERIALS" | "SPORT" | "GENERIC";

export function activityTheme(description: string): ActivityTheme {
  const n = normalize(description);
  if (/ponto(s)? de venda|loja|banca|quiosque/.test(n)) return "SALES_POINT";
  if (/aplicativo|\bapp\b|plataforma|site|digital/.test(n)) return "APP";
  if (/feira|exposic|mostra/.test(n)) return "FAIR";
  if (/muda|semente|insumo|kit|ferrament|equipament|distribu|fornec/.test(n)) return "SUPPLIES";
  if (/treino|treinament esportiv|campeonato|torneio|escolinha|modalidade/.test(n)) return "SPORT";
  if (/capacit|oficina|curso|formac|aula|encontro|palestra|roda de conversa|workshop|seminario|mentoria/.test(n))
    return "TRAINING";
  if (/visita|acompanh|assessor|atendiment|assistencia tecnica/.test(n)) return "VISITS";
  if (/material|cartilha|guia|manual|video|produz|elabor/.test(n)) return "MATERIALS";
  return "GENERIC";
}

/** Pergunta curta sobre a meta, adaptada ao tipo de atividade. */
export function activityTargetQuestion(description: string): string {
  switch (activityTheme(description)) {
    case "TRAINING":
      return "O que será ofertado? Informe, se já souberem, a quantidade de encontros, participantes, horas e o período em que ocorrerão.";
    case "SUPPLIES":
      return "O que será fornecido? Informe, se já souberem, a quantidade e o tipo de insumos, quantas famílias ou pessoas receberão e em que período.";
    case "FAIR":
      return "O que será realizado? Informe, se já souberem, quantas feiras ou eventos, quantos participantes e em que período.";
    case "SALES_POINT":
      return "O que será implantado? Informe, se já souberem, quantos pontos de venda, quem será atendido e em que período.";
    case "APP":
      return "O que será disponibilizado? Informe, se já souberem, o que o aplicativo terá, quantas pessoas devem utilizá-lo e em que prazo.";
    case "VISITS":
      return "O que será realizado? Informe, se já souberem, a quantidade de visitas ou atendimentos, quem será atendido e em que período.";
    case "MATERIALS":
      return "O que será produzido? Informe, se já souberem, quais materiais, quantos exemplares e em que prazo.";
    case "SPORT":
      return "O que será ofertado? Informe, se já souberem, a quantidade de treinos ou turmas, participantes, frequência e período.";
    default:
      return "O que será ofertado? Informe, se já souberem, a quantidade, o público atendido e o período em que ocorrerá.";
  }
}

const DEADLINE_PATTERN =
  /(at[eé]\s+(?:o|a)\s+[^,.;]+|at[eé]\s+\d+[^,.;]*|ao longo d[oe]s?\s+[^,.;]+|durante\s+[^,.;]+|entre\s+[^,.;]+|no\s+\d+º?\s*(?:mês|mes)[^,.;]*|em\s+\d+\s+(?:meses|mês|mes|anos?)|nos?\s+(?:primeiros?|últimos?|ultimos?)\s+[^,.;]+)/i;

export function extractDeadline(text: string): string | null {
  const match = text.match(DEADLINE_PATTERN);
  return match ? stripTrailingPeriod(match[0]) : null;
}

/** Primeira quantidade explícita informada pela pessoa (nunca inventada). */
export function extractQuantity(text: string): { quantity: number; unit: string } | null {
  const regex = /(\d+(?:[.,]\d+)?)\s+([a-zà-úç]+)/gi;
  for (const match of text.matchAll(regex)) {
    const unit = match[2].toLowerCase();
    if (/^(mes|mês|meses|anos?|dias?|semanas?|horas?)$/.test(unit)) continue;
    const quantity = Number(match[1].replace(",", "."));
    if (Number.isFinite(quantity)) return { quantity, unit };
  }
  return null;
}

/**
 * Duração explícita em meses ("durante 13 meses", "por 1 ano"). O provedor
 * mock usa este texto; o externo devolve o número na resposta estruturada.
 */
export function extractDurationMonths(text: string): number | null {
  const match = text.match(/(\d+)\s*(meses|m[eê]s|anos?)\b/i);
  if (!match) return null;
  const value = Number(match[1]);
  return /^ano/i.test(match[2]) ? value * 12 : value;
}

/** Atividade declarada antes do início ou depois do encerramento do projeto. */
export function extractActivityPeriod(text: string): ActivityPeriod | null {
  const t = text.toLowerCase();
  if (/(depois|ap[oó]s)\s+(d?o\s+)?(fim|t[eé]rmino|encerramento|final)\s+do\s+projeto|depois\s+do\s+projeto|ap[oó]s\s+o\s+projeto/.test(t)) {
    return "AFTER_PROJECT";
  }
  if (/antes\s+(d?o\s+)?(in[ií]cio\s+do\s+)?projeto/.test(t)) return "BEFORE_PROJECT";
  return null;
}

export function suggestActivityIndicators(
  description: string,
  audienceUnit: string,
): Pick<ActivityPayload, "indicators" | "evidences"> {
  const reach = "Observa o alcance da atividade junto ao público.";
  const delivery = "Observa se a oferta prevista foi cumprida.";
  switch (activityTheme(description)) {
    case "TRAINING":
      return {
        indicators: [
          { name: "Número de encontros realizados", explanation: delivery },
          { name: "Número de participantes por encontro", explanation: reach },
        ],
        evidences: [{ description: "Lista de presença" }, { description: "Registro fotográfico dos encontros" }],
      };
    case "SUPPLIES":
      return {
        indicators: [
          { name: "Quantidade de insumos entregues", explanation: delivery },
          { name: `Número de ${audienceUnit} que receberam os insumos`, explanation: reach },
        ],
        evidences: [{ description: "Termo de recebimento" }, { description: "Registro fotográfico das entregas" }],
      };
    case "FAIR":
      return {
        indicators: [
          { name: "Número de feiras realizadas ou apoiadas", explanation: delivery },
          { name: `Número de ${audienceUnit} participantes das feiras`, explanation: reach },
        ],
        evidences: [{ description: "Registro das feiras (data, local e número de participantes)" }, { description: "Registro fotográfico" }],
      };
    case "SALES_POINT":
      return {
        indicators: [
          { name: "Número de pontos de venda implantados", explanation: delivery },
          { name: `Número de ${audienceUnit} com produtos nos pontos de venda`, explanation: reach },
        ],
        evidences: [{ description: "Relatório de implantação dos pontos de venda" }, { description: "Registro fotográfico" }],
      };
    case "APP":
      return {
        indicators: [
          { name: "Aplicativo disponibilizado para uso", explanation: delivery },
          { name: `Número de ${audienceUnit} cadastrados no aplicativo`, explanation: reach },
        ],
        evidences: [{ description: "Relatório de cadastros do aplicativo" }, { description: "Registro da publicação do aplicativo" }],
      };
    case "VISITS":
      return {
        indicators: [
          { name: "Número de visitas ou atendimentos realizados", explanation: delivery },
          { name: `Número de ${audienceUnit} atendidos`, explanation: reach },
        ],
        evidences: [{ description: "Relatório de visitas realizadas" }],
      };
    case "MATERIALS":
      return {
        indicators: [
          { name: "Número de materiais produzidos", explanation: delivery },
          { name: "Número de exemplares distribuídos", explanation: reach },
        ],
        evidences: [{ description: "Cópia dos materiais produzidos" }, { description: "Registro de distribuição" }],
      };
    case "SPORT":
      return {
        indicators: [
          { name: "Número de treinos ou turmas realizados", explanation: delivery },
          { name: "Número de participantes com frequência regular", explanation: reach },
        ],
        evidences: [{ description: "Lista de presença" }, { description: "Registro fotográfico" }],
      };
    default:
      return {
        indicators: [
          { name: "Número de ações realizadas", explanation: delivery },
          { name: `Número de ${audienceUnit} atendidos`, explanation: reach },
        ],
        evidences: [{ description: "Relatório de execução da atividade" }, { description: "Registro fotográfico" }],
      };
  }
}

export function buildActivityPayload(description: string, targetText: string, audienceUnit: string): ActivityPayload {
  const quantity = extractQuantity(targetText);
  return {
    description,
    target: {
      description: upperFirst(stripTrailingPeriod(targetText)),
      deadline: extractDeadline(targetText),
      quantity: quantity?.quantity ?? null,
      unit: quantity?.unit ?? null,
      durationMonths: extractDurationMonths(targetText),
      period: extractActivityPeriod(targetText),
    },
    ...suggestActivityIndicators(description, audienceUnit),
  };
}

// ---------------------------------------------------------------------------
// Mudanças esperadas
// ---------------------------------------------------------------------------

export interface OutcomeSuggestion {
  /** Sujeito + verbo + mudança observável (sem ponto final). */
  statement: string;
  /** Parte da frase sem o sujeito, usada na sugestão de meta. */
  predicate: string;
  relatedActivityIds: string[];
}

interface OutcomeRule {
  matches: (theme: ActivityTheme, n: string) => boolean;
  predicate: (agricultural: boolean) => string;
}

const OUTCOME_RULES: OutcomeRule[] = [
  {
    // Formação técnica → aplicação prática do que foi aprendido.
    matches: (theme) => theme === "TRAINING" || theme === "VISITS" || theme === "MATERIALS",
    predicate: (agricultural) =>
      agricultural
        ? "passem a utilizar, em suas áreas produtivas, as técnicas trabalhadas no projeto"
        : "passem a aplicar no dia a dia as práticas trabalhadas no projeto",
  },
  {
    // Insumos → ampliação da produção.
    matches: (theme) => theme === "SUPPLIES",
    predicate: (agricultural) =>
      agricultural
        ? "ampliem a produção de alimentos em seus quintais e áreas produtivas"
        : "passem a utilizar os recursos recebidos em suas atividades",
  },
  {
    // Feiras, pontos de venda, aplicativo → acesso a canais de comercialização.
    matches: (theme, n) => theme === "FAIR" || theme === "SALES_POINT" || (theme === "APP" && /vend|comerci|produt/.test(n)),
    predicate: () => "passem a utilizar novos canais de comercialização para vender sua produção",
  },
  {
    matches: (theme) => theme === "SPORT",
    predicate: () => "passem a praticar atividade física com regularidade",
  },
];

/**
 * Sugere até três mudanças de médio prazo, cada uma ligada às atividades que a
 * sustentam. Só sugere mudanças que decorrem diretamente das ações aprovadas.
 */
export function suggestOutcomes(
  activities: ActivityView[],
  targetAudience: string,
  context: string,
  limit = 3,
): OutcomeSuggestion[] {
  const { subject } = audienceShort(targetAudience);
  const agricultural = /agric|plant|cultiv|quinta|lavoura|hort|semiarid|produc|rural/.test(
    normalize(`${context} ${activities.map((a) => a.description).join(" ")}`),
  );

  const groups = new Map<number, string[]>();
  const unmatched: ActivityView[] = [];
  for (const activity of activities) {
    const n = normalize(activity.description);
    const theme = activityTheme(activity.description);
    const index = OUTCOME_RULES.findIndex((rule) => rule.matches(theme, n));
    if (index === -1) unmatched.push(activity);
    else groups.set(index, [...(groups.get(index) ?? []), activity.id]);
  }

  const suggestions: OutcomeSuggestion[] = [...groups.entries()]
    .sort(([a], [b]) => a - b)
    .map(([index, ids]) => {
      const predicate = OUTCOME_RULES[index].predicate(agricultural);
      return { statement: `${subject} ${predicate}`, predicate, relatedActivityIds: ids };
    });

  for (const activity of unmatched) {
    if (suggestions.length >= limit) break;
    const predicate = `passem a utilizar no dia a dia o que foi ofertado em “${stripTrailingPeriod(activity.description)}”`;
    suggestions.push({ statement: `${subject} ${predicate}`, predicate, relatedActivityIds: [activity.id] });
  }

  return suggestions.slice(0, limit);
}

export function outcomeSuggestionText(
  index: number,
  suggestion: { statement: string; relatedActivityIds: string[] },
  activities: ActivityView[],
): string {
  const related = activities.filter((a) => suggestion.relatedActivityIds.includes(a.id));
  const from = joinPt(related.map((a) => `“${stripTrailingPeriod(a.description)}”`));
  return `Resultado ${String(index + 1).padStart(2, "0")}\nA partir de ${from}, esperamos que **${stripTrailingPeriod(suggestion.statement)}.**`;
}

/** Parte da frase após o sujeito, quando a mudança começa com o público. */
export function outcomePredicate(statement: string, targetAudience: string): string | null {
  const { subject } = audienceShort(targetAudience);
  const s = stripTrailingPeriod(statement);
  if (normalize(s).startsWith(normalize(subject))) return s.slice(subject.length).trim();
  return null;
}

export function suggestOutcomeIndicator(
  statement: string,
  audienceUnit: string,
): { name: string; explanation: string; verification: string } {
  const n = normalize(statement);
  const explanation = "Mostra quanto do público alcançou a mudança ao final do projeto.";
  const families = audienceUnit === "famílias";
  if (/renda/.test(n)) {
    return {
      name: `Variação da renda obtida com a comercialização pelas ${audienceUnit}`,
      explanation,
      verification: "Relatório de evolução da renda obtida com a comercialização",
    };
  }
  if (/comerci|vend|canais/.test(n)) {
    return {
      name: `Percentual de ${audienceUnit} que utilizam ao menos um novo canal de comercialização`,
      explanation,
      verification: "Relatório de utilização dos canais de comercialização",
    };
  }
  if (/produc|quinta|aliment|cultiv|plant/.test(n)) {
    return {
      name: `Percentual de ${audienceUnit} com aumento da produção nos quintais e áreas produtivas`,
      explanation,
      verification: families ? "Relatório de evolução das famílias" : "Relatório de evolução da produção",
    };
  }
  if (/tecnica|pratica|aplic|utiliz/.test(n)) {
    return {
      name: `Percentual de ${audienceUnit} que aplicam as práticas trabalhadas`,
      explanation,
      verification: families ? "Relatório de evolução das famílias" : "Relatório de acompanhamento dos participantes",
    };
  }
  if (/atividade fisica|pratic/.test(n)) {
    return {
      name: `Percentual de ${audienceUnit} que praticam atividade física com regularidade`,
      explanation,
      verification: "Relatório de acompanhamento dos participantes",
    };
  }
  return {
    name: `Percentual de ${audienceUnit} que apresentam a mudança esperada`,
    explanation,
    verification: "Relatório de acompanhamento do público",
  };
}

// ---------------------------------------------------------------------------
// Impacto
// ---------------------------------------------------------------------------

/** Formula o impacto como contribuição do projeto. */
export function formulateImpact(text: string): string {
  const clean = stripTrailingPeriod(text.replace(/\s+/g, " "));
  const n = normalize(clean);
  if (n.startsWith("contribuir") || n.startsWith("o projeto contribui")) return `${upperFirst(clean)}.`;
  const firstWord = n.split(" ")[0] ?? "";
  const isInfinitive = /(ar|er|ir)$/.test(firstWord);
  return isInfinitive ? `Contribuir para ${lowerFirst(clean)}.` : `Contribuir para que ${lowerFirst(clean)}.`;
}

const PERIOD_PATTERN = /(\d+)\s*(meses|mês|mes|anos?)/i;

export function extractPeriodAfterEnd(text: string): string | null {
  const match = text.match(PERIOD_PATTERN);
  if (!match) return null;
  return `${match[1]} ${match[2].toLowerCase()} após o encerramento`;
}
