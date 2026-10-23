import type { JourneyAIAction, JourneyConversationState } from "@/lib/journey-ai/response-schema";
import type { ProposalTypeKey } from "@/lib/journey/proposal-schemas";
import type { RuleIssue } from "@/lib/journey/proposal-rules";
import type { JourneyStageKey } from "@/lib/journey/stages";
import type { JourneySnapshot } from "@/lib/journey/types";

export interface MessageView {
  id: string;
  role: "ASSISTANT" | "USER";
  content: string;
  stage: JourneyStageKey;
  actions: JourneyAIAction[];
  proposalId: string | null;
  isMock: boolean;
  createdAt: string;
}

export interface ProposalView {
  id: string;
  type: ProposalTypeKey;
  stage: JourneyStageKey;
  payload: unknown;
  status: "PENDING" | "APPROVED" | "REJECTED" | "SUPERSEDED";
  isMock: boolean;
  /** Alertas metodológicos: precisam ser resolvidos antes de aprovar. */
  warnings: RuleIssue[];
  createdAt: string;
}

/** Estado completo da tela da jornada, devolvido por todas as rotas. */
export interface JourneyViewState {
  snapshot: JourneySnapshot;
  messages: MessageView[];
  pendingProposal: ProposalView | null;
  /** Propostas já decididas que aparecem no histórico do chat. */
  proposals: Record<string, ProposalView>;
  conversationState: JourneyConversationState | null;
  canEdit: boolean;
  aiMode: "mock" | "external";
  /** Erro amigável do consultor virtual, quando o turno não pôde ser gerado. */
  aiError?: string;
  /** O último turno do consultor falhou e pode ser repetido ("Tentar novamente"). */
  canRetry: boolean;
}
