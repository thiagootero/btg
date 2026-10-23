/**
 * Identificadores de ações com significado fixo para o servidor e a interface.
 * Demais ids são livres e interpretados pelo provedor de IA.
 */
export const ACTION_IDS = {
  /** Servidor valida e aprova a etapa atual. */
  APPROVE_STAGE: "approve-stage",
  /** Ações sobre a proposta pendente (tratadas pela rota de propostas). */
  APPROVE_PROPOSAL: "approve-proposal",
  EDIT_PROPOSAL: "edit-proposal",
  REJECT_PROPOSAL: "reject-proposal",
} as const;

/** Ações "navigate:/caminho" apenas levam a outra página do projeto. */
export const NAVIGATE_PREFIX = "navigate:";

export function navigateAction(path: string, label: string, intent: "CONTINUE" | "EDIT" = "CONTINUE") {
  return { id: `${NAVIGATE_PREFIX}${path}`, label, intent } as const;
}

export function isNavigateAction(id: string): boolean {
  return id.startsWith(NAVIGATE_PREFIX);
}

export function navigatePath(id: string): string | null {
  if (!isNavigateAction(id)) return null;
  const path = id.slice(NAVIGATE_PREFIX.length);
  // Somente caminhos internos.
  return path.startsWith("/") && !path.startsWith("//") ? path : null;
}

export const PROPOSAL_ACTIONS = [
  { id: ACTION_IDS.APPROVE_PROPOSAL, label: "Aprovar", intent: "APPROVE" },
  { id: ACTION_IDS.EDIT_PROPOSAL, label: "Editar", intent: "EDIT" },
  { id: ACTION_IDS.REJECT_PROPOSAL, label: "Excluir", intent: "DELETE" },
] as const;

export function isProposalAction(id: string): boolean {
  return id === ACTION_IDS.APPROVE_PROPOSAL || id === ACTION_IDS.EDIT_PROPOSAL || id === ACTION_IDS.REJECT_PROPOSAL;
}
