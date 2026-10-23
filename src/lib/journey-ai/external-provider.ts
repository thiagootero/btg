/**
 * ExternalJourneyAIProvider — consultor virtual conectado à OpenAI (Responses
 * API com Structured Outputs).
 *
 * Fluxo de um turno:
 *   1. monta as instruções (jornada-impacto-system-prompt.md via
 *      system-prompt.ts) e o contexto do projeto
 *      (buildModelContext), com apenas o histórico recente da etapa atual;
 *   2. pede ao modelo uma resposta no schema estrito de openai-schema.ts;
 *   3. converte e valida a resposta com Zod (contrato + schema da proposta);
 *   4. registra os metadados técnicos de uso (modelo, tokens, status).
 *
 * O modelo apenas PROPÕE: nenhuma chamada aqui grava atividade, resultado,
 * impacto ou plano. O servidor grava a proposta como pendente e só a aplica
 * após aprovação explícita da pessoa (ver src/server/journey).
 *
 * Segurança: a chave (OPENAI_API_KEY) é lida só no servidor e nunca aparece em
 * mensagens de erro ou logs.
 */
import "server-only";
import OpenAI, { APIConnectionTimeoutError, APIError, AuthenticationError, PermissionDeniedError, RateLimitError } from "openai";
import { ACTION_IDS, isProposalAction, navigatePath } from "@/lib/journey/actions";
import { isActivityComplete, stageApprovalBlockers } from "@/lib/journey/progress";
import { parseProposalPayload } from "@/lib/journey/proposal-schemas";
import { STAGE_LABELS } from "@/lib/journey/stages";
import { fromOpenAIOutput, OPENAI_FORMAT_NOTES, OPENAI_RESPONSE_FORMAT } from "@/lib/journey-ai/openai-schema";
import { buildJourneySystemPrompt } from "@/lib/journey-ai/system-prompt";
import type {
  JourneyAIHistoryMessage,
  JourneyAIInput,
  JourneyAIProvider,
  JourneyAIRequest,
  JourneyAIResponse,
  JourneyAIUsage,
  JourneyAIUsageStatus,
} from "@/lib/journey-ai/types";

export const DEFAULT_OPENAI_MODEL = "gpt-6.1-sol";
/** Limite de saída por resposta (mensagem + proposta). */
export const MAX_OUTPUT_TOKENS = 900;
/** Mensagens anteriores enviadas ao modelo (apenas da etapa atual). */
export const HISTORY_MESSAGES = 10;
const HISTORY_MESSAGE_CHARS = 2000;

const REASONING_EFFORTS = ["none", "minimal", "low", "medium", "high"] as const;
type ReasoningEffort = (typeof REASONING_EFFORTS)[number];

export interface ExternalProviderConfig {
  apiKey: string;
  model: string;
  timeoutMs: number;
  /** Opcional: esforço de raciocínio, apenas para modelos que o suportam. */
  reasoningEffort?: ReasoningEffort;
}

export class JourneyAIConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "JourneyAIConfigurationError";
  }
}

/** Falha de uma chamada ao provedor, com mensagem pronta para a pessoa usuária. */
export class JourneyAIProviderError extends Error {
  constructor(
    readonly userMessage: string,
    readonly status: JourneyAIUsageStatus,
    /** Detalhe técnico para o log do servidor (nunca contém a chave). */
    readonly detail: string,
  ) {
    super(detail);
    this.name = "JourneyAIProviderError";
  }
}

/** Lê a configuração do provedor externo das variáveis de ambiente do servidor. */
export function readExternalProviderConfig(env: Record<string, string | undefined> = process.env): ExternalProviderConfig {
  const apiKey = env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new JourneyAIConfigurationError(
      "O consultor virtual está configurado para usar a OpenAI (AI_PROVIDER=external), mas falta a variável OPENAI_API_KEY no servidor. Configure-a ou volte para AI_PROVIDER=mock.",
    );
  }
  const effort = env.OPENAI_REASONING_EFFORT?.trim().toLowerCase();
  if (effort && !REASONING_EFFORTS.includes(effort as ReasoningEffort)) {
    throw new JourneyAIConfigurationError(
      `Valor inválido para OPENAI_REASONING_EFFORT: "${effort}". Use ${REASONING_EFFORTS.join(", ")} ou deixe vazio.`,
    );
  }
  const timeout = Number(env.OPENAI_TIMEOUT_MS);
  return {
    apiKey,
    model: env.OPENAI_MODEL?.trim() || DEFAULT_OPENAI_MODEL,
    timeoutMs: Number.isFinite(timeout) && timeout > 0 ? timeout : 60_000,
    reasoningEffort: (effort || undefined) as ReasoningEffort | undefined,
  };
}

/**
 * Contexto estruturado do turno: projeto, etapa atual e decisões já aprovadas
 * (fonte de verdade), rascunho e proposta pendente. Só dados agregados do
 * projeto — nunca dados pessoais de participantes.
 */
export function buildModelContext(request: JourneyAIRequest): string {
  const { snapshot } = request;
  const stage = request.stage;
  const nextActivity = snapshot.activities.find((a) => !isActivityComplete(a));
  return JSON.stringify({
    etapaAtual: request.stage ? { id: request.stage, nome: STAGE_LABELS[request.stage] } : null,
    // Explícitos para a verificação de coerência temporal das metas.
    duracaoDoProjetoEmMeses: snapshot.project.durationMonths,
    dataDeInicio: snapshot.project.startDate,
    // Calculado pelo servidor: o que falta na etapa atual (fonte de verdade).
    situacaoDaEtapa: stage
      ? {
          podeSerAprovada: stageApprovalBlockers(snapshot, stage).length === 0,
          faltando: stageApprovalBlockers(snapshot, stage),
          ...(stage === "ACTIVITIES" && {
            listaDeAtividadesDefinida: snapshot.activities.length > 0,
            proximaAtividadeParaDetalhar: nextActivity ? { id: nextActivity.id, descricao: nextActivity.description } : null,
          }),
        }
      : null,
    projeto: snapshot.project,
    etapasAprovadas: snapshot.approvedStages,
    decisoesAprovadas: {
      atividades: snapshot.activities,
      resultadosDeMedioPrazo: snapshot.outcomes,
      impacto: snapshot.impact,
      ...(snapshot.evidencePlan.length > 0 && { planoDeEvidencias: snapshot.evidencePlan }),
    },
    rascunhoDaConversa: request.state,
    propostaPendente: request.pendingProposal,
  });
}

/**
 * Histórico recente e necessário: só mensagens da etapa atual, no máximo
 * HISTORY_MESSAGES, cada uma truncada. A mensagem deste turno já foi gravada
 * antes da chamada; ela sai do histórico porque vai como entrada nova.
 */
export function recentHistory(request: JourneyAIRequest): JourneyAIHistoryMessage[] {
  const history = [...request.history];
  const last = history.at(-1);
  const current = request.input.kind === "MESSAGE" ? request.input.text : request.input.kind === "ACTION" ? request.input.label : null;
  if (last?.role === "user" && current !== null && last.content.trim() === current.trim()) history.pop();
  return history
    .filter((m) => !request.stage || m.stage === request.stage)
    .slice(-HISTORY_MESSAGES)
    .map((m) => ({ ...m, content: m.content.slice(0, HISTORY_MESSAGE_CHARS) }));
}

const EVENT_DESCRIPTIONS: Record<Extract<JourneyAIInput, { kind: "EVENT" }>["event"], string> = {
  PROPOSAL_APPROVED: "A pessoa aprovou a proposta. O conteúdo já foi gravado no projeto pelo servidor.",
  PROPOSAL_REJECTED: "A pessoa excluiu a proposta. Nada foi gravado.",
  STAGE_APPROVED: "A pessoa aprovou a etapa.",
  STAGE_REOPENED: "A pessoa reabriu a etapa para revisão.",
  CONTENT_EDITED: "A pessoa editou um conteúdo já aprovado.",
};

/** Descreve o que motivou este turno: a nova mensagem, a opção escolhida ou o evento. */
export function describeInput(input: JourneyAIInput): string {
  switch (input.kind) {
    case "START":
      return "Início da conversa: apresente-se em uma frase e conduza a etapa atual.";
    case "MESSAGE":
      return `Nova mensagem da pessoa usuária:\n${input.text}`;
    case "ACTION":
      return `A pessoa escolheu a opção "${input.label}" (id: ${input.actionId}, intenção: ${input.intent}).`;
    case "EVENT": {
      const parts = [EVENT_DESCRIPTIONS[input.event]];
      if (input.proposalType) parts.push(`Tipo da proposta: ${input.proposalType}.`);
      if (input.stage) parts.push(`Etapa: ${STAGE_LABELS[input.stage]}.`);
      if (input.detail) parts.push(`Observação do servidor: ${input.detail}`);
      return parts.join(" ");
    }
  }
}

const NOTHING_CHANGED = "Nada foi alterado no projeto.";

/** Converte falhas da API em mensagens claras, sem detalhes técnicos nem a chave. */
export function toProviderError(error: unknown): JourneyAIProviderError {
  if (error instanceof JourneyAIProviderError) return error;
  if (error instanceof APIConnectionTimeoutError) {
    return new JourneyAIProviderError(
      `O consultor virtual demorou demais para responder. ${NOTHING_CHANGED}`,
      "TIMEOUT",
      "timeout na chamada à OpenAI",
    );
  }
  if (error instanceof AuthenticationError || error instanceof PermissionDeniedError) {
    return new JourneyAIProviderError(
      `O consultor virtual está indisponível por um problema de configuração. Avise a equipe responsável pela plataforma. ${NOTHING_CHANGED}`,
      "API_ERROR",
      `OpenAI recusou a credencial (HTTP ${error.status})`,
    );
  }
  if (error instanceof RateLimitError) {
    return new JourneyAIProviderError(
      `O consultor virtual atingiu o limite de uso no momento. Aguarde alguns instantes. ${NOTHING_CHANGED}`,
      "API_ERROR",
      `OpenAI limitou a requisição (HTTP 429${error.code ? `, ${error.code}` : ""})`,
    );
  }
  if (error instanceof APIError) {
    return new JourneyAIProviderError(
      `O consultor virtual não conseguiu responder agora. ${NOTHING_CHANGED}`,
      "API_ERROR",
      `falha da OpenAI (HTTP ${error.status ?? "sem status"}${error.code ? `, ${error.code}` : ""}): ${error.message}`,
    );
  }
  return new JourneyAIProviderError(
    `O consultor virtual não conseguiu responder agora. ${NOTHING_CHANGED}`,
    "API_ERROR",
    error instanceof Error ? `${error.name}: ${error.message}` : "erro desconhecido",
  );
}

/**
 * Remove opções que o modelo pode oferecer fora de hora e que o servidor
 * recusaria: links para páginas que não são deste projeto, decisões sobre uma
 * proposta que não existe, aprovação de etapa ainda incompleta e opções de
 * avançar ("acrescentar", "continuar") com uma atividade em rascunho sem ficha.
 */
export function withValidActions(response: JourneyAIResponse, request: JourneyAIRequest): JourneyAIResponse {
  const { snapshot } = request;
  const base = `/projetos/${snapshot.project.id}`;
  const hasProposal = Boolean(response.proposal || request.pendingProposal);
  const stageReady =
    !hasProposal && request.stage !== null && stageApprovalBlockers(snapshot, request.stage).length === 0;
  const state = response.state === undefined ? request.state : response.state;
  const draftWithoutForm = !hasProposal && state?.kind === "ACTIVITY_DRAFT";
  const actions = response.actions.filter((action) => {
    if (action.id.startsWith("navigate:")) {
      const path = navigatePath(action.id);
      return path !== null && (path === base || path.startsWith(`${base}/`));
    }
    if (isProposalAction(action.id)) return hasProposal;
    if (action.id === ACTION_IDS.APPROVE_STAGE) return stageReady;
    if (draftWithoutForm && (action.intent === "ADD" || action.intent === "CONTINUE")) return false;
    return true;
  });
  return actions.length === response.actions.length ? response : { ...response, actions };
}

/**
 * Letra de outro alfabeto (híndi, chinês, cirílico...). Modelos menores às vezes
 * trocam parte de uma palavra por um token de outro idioma ("participantes" →
 * "सहभागीdas"); a resposta inteira é recusada para nada disso chegar à ficha.
 */
const FOREIGN_SCRIPT = /(?![\p{Script=Latin}])\p{L}/u;

export function hasForeignScript(text: string): boolean {
  return FOREIGN_SCRIPT.test(text);
}

/** Parte do cliente OpenAI usada aqui (permite um cliente simulado nos testes). */
export type ResponsesClient = Pick<OpenAI, "responses">;

export interface ExternalProviderOptions {
  client?: ResponsesClient;
  /** Grava os metadados técnicos de uso de cada chamada (sucesso ou falha). */
  recordUsage?: (usage: JourneyAIUsage) => Promise<void>;
}

export class ExternalJourneyAIProvider implements JourneyAIProvider {
  readonly name = "external";
  readonly isMock = false;
  private readonly client: ResponsesClient;

  constructor(
    private readonly config: ExternalProviderConfig,
    private readonly options: ExternalProviderOptions = {},
  ) {
    // Sem tentativas automáticas: em caso de falha, a pessoa decide se tenta de novo.
    this.client = options.client ?? new OpenAI({ apiKey: config.apiKey, maxRetries: 0, timeout: config.timeoutMs });
  }

  async respond(request: JourneyAIRequest): Promise<JourneyAIResponse> {
    let inputTokens = 0;
    let outputTokens = 0;
    try {
      const response = await this.client.responses.create(
        {
          model: this.config.model,
          // Instrução principal: o .md da metodologia, relido a cada chamada.
          instructions: `${buildJourneySystemPrompt()}\n\n${OPENAI_FORMAT_NOTES.trim()}`,
          input: [
            ...recentHistory(request).map((m) => ({ role: m.role, content: m.content })),
            {
              role: "user" as const,
              content: `Contexto do projeto (JSON; dados aprovados são a fonte de verdade):\n${buildModelContext(request)}\n\n${describeInput(request.input)}`,
            },
          ],
          text: { format: OPENAI_RESPONSE_FORMAT },
          max_output_tokens: MAX_OUTPUT_TOKENS,
          // Sem ferramentas (busca, arquivos, imagens) e sem guardar a conversa na OpenAI.
          store: false,
          ...(this.config.reasoningEffort && { reasoning: { effort: this.config.reasoningEffort } }),
        },
        { maxRetries: 0, timeout: this.config.timeoutMs },
      );
      inputTokens = response.usage?.input_tokens ?? 0;
      outputTokens = response.usage?.output_tokens ?? 0;

      if (response.status === "incomplete") {
        throw new JourneyAIProviderError(
          `A resposta do consultor virtual ficou incompleta. ${NOTHING_CHANGED}`,
          "INCOMPLETE",
          `resposta incompleta (${response.incomplete_details?.reason ?? "motivo não informado"})`,
        );
      }
      const refusal = response.output
        .flatMap((item) => (item.type === "message" ? item.content : []))
        .find((part) => part.type === "refusal");
      if (refusal) {
        throw new JourneyAIProviderError(
          `O consultor virtual não pôde responder a esse pedido. Reformule a mensagem. ${NOTHING_CHANGED}`,
          "REFUSED",
          "o modelo recusou a solicitação",
        );
      }

      if (hasForeignScript(response.output_text)) {
        throw new JourneyAIProviderError(
          `O consultor virtual gerou um texto com caracteres inválidos. ${NOTHING_CHANGED} Tente novamente.`,
          "INVALID_RESPONSE",
          "resposta com caracteres de outro alfabeto",
        );
      }

      let result: JourneyAIResponse;
      try {
        result = fromOpenAIOutput(JSON.parse(response.output_text));
        if (result.proposal) parseProposalPayload(result.proposal.type, result.proposal.payload);
      } catch (error) {
        throw new JourneyAIProviderError(
          `O consultor virtual respondeu em um formato inesperado. ${NOTHING_CHANGED}`,
          "INVALID_RESPONSE",
          `resposta fora do contrato: ${error instanceof Error ? error.message.slice(0, 500) : "erro desconhecido"}`,
        );
      }
      await this.record({ inputTokens, outputTokens, status: "SUCCESS" });
      return withValidActions(result, request);
    } catch (error) {
      const failure = toProviderError(error);
      await this.record({ inputTokens, outputTokens, status: failure.status });
      throw failure;
    }
  }

  /** O registro de uso nunca derruba o turno. */
  private async record(usage: Omit<JourneyAIUsage, "model">) {
    try {
      await this.options.recordUsage?.({ model: this.config.model, ...usage });
    } catch (error) {
      console.error("[journey-ai] falha ao registrar uso da IA", error instanceof Error ? error.message : error);
    }
  }
}
