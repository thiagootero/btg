import type { JourneyStageKey } from "@/lib/journey/stages";
import type { JourneySnapshot } from "@/lib/journey/types";
import type { ProposalTypeKey } from "@/lib/journey/proposal-schemas";
import type { JourneyAIAction, JourneyAIResponse, JourneyConversationState } from "@/lib/journey-ai/response-schema";

export type { JourneyAIAction, JourneyAIResponse, JourneyConversationState };

export type ActionIntent = JourneyAIAction["intent"];

/** O que motivou este turno do consultor. */
export type JourneyAIInput =
  | { kind: "START" }
  | { kind: "MESSAGE"; text: string }
  | { kind: "ACTION"; actionId: string; intent: ActionIntent; label: string }
  | {
      kind: "EVENT";
      event: "PROPOSAL_APPROVED" | "PROPOSAL_REJECTED" | "STAGE_APPROVED" | "STAGE_REOPENED" | "CONTENT_EDITED";
      proposalType?: ProposalTypeKey;
      stage?: JourneyStageKey;
      /** Mensagem de validação do servidor, quando houver. */
      detail?: string;
    };

export interface JourneyAIHistoryMessage {
  role: "assistant" | "user";
  content: string;
  stage: JourneyStageKey;
}

export interface JourneyAIRequest {
  /** Projeto e tudo o que já foi aprovado (fonte de verdade). */
  snapshot: JourneySnapshot;
  /** Etapa em que a conversa está (primeira etapa não aprovada). */
  stage: JourneyStageKey | null;
  /** Estado transitório da conversa (rascunho em construção). */
  state: JourneyConversationState | null;
  /** Proposta pendente de decisão, se houver. */
  pendingProposal: { id: string; type: ProposalTypeKey; payload: unknown } | null;
  /** Mensagens recentes (mais antigas primeiro). */
  history: JourneyAIHistoryMessage[];
  input: JourneyAIInput;
}

/** Resultado técnico de uma chamada ao provedor externo (registrado no banco). */
export type JourneyAIUsageStatus = "SUCCESS" | "INCOMPLETE" | "REFUSED" | "INVALID_RESPONSE" | "TIMEOUT" | "API_ERROR";

/** Metadados técnicos de uso por chamada. Nunca inclui a chave nem o conteúdo. */
export interface JourneyAIUsage {
  model: string;
  inputTokens: number;
  outputTokens: number;
  status: JourneyAIUsageStatus;
}

export interface JourneyAIProvider {
  readonly name: string;
  /** true quando as respostas são simuladas (modo de teste). */
  readonly isMock: boolean;
  respond(input: JourneyAIRequest): Promise<JourneyAIResponse>;
}
