"use client";

import { useCallback, useState } from "react";
import { ApiError, apiFetch } from "@/lib/client/api";
import type { JourneyStageKey } from "@/lib/journey/stages";
import type { JourneyViewState } from "@/lib/journey/view-types";

/** Estado da tela da jornada e chamadas às rotas do servidor. */
export function useJourney(initial: JourneyViewState) {
  const [view, setView] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [pendingUserText, setPendingUserText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(initial.aiError ?? null);
  const [notice, setNotice] = useState<string | null>(null);
  const base = `/api/projects/${initial.snapshot.project.id}`;

  const call = useCallback(
    async (url: string, body?: unknown, method = "POST", success?: string): Promise<ApiError | null> => {
      setBusy(true);
      setError(null);
      setNotice(null);
      try {
        const next = await apiFetch<JourneyViewState>(url, { method, body: body ?? {} });
        setView(next);
        if (next.aiError) setError(next.aiError);
        else if (success) setNotice(success);
        return null;
      } catch (e) {
        const apiError = e instanceof ApiError ? e : new ApiError("Algo não saiu como esperado.", 500);
        setError(apiError.message);
        return apiError;
      } finally {
        setBusy(false);
        setPendingUserText(null);
      }
    },
    [],
  );

  return {
    view,
    busy,
    error,
    notice,
    pendingUserText,
    dismissError: () => setError(null),
    start: () => call(`${base}/journey/messages`, { type: "start" }),
    sendMessage: (text: string) => {
      setPendingUserText(text);
      return call(`${base}/journey/messages`, { type: "message", text });
    },
    sendAction: (actionId: string) => call(`${base}/journey/messages`, { type: "action", actionId }),
    retry: () => call(`${base}/journey/messages`, { type: "retry" }),
    decideProposal: (proposalId: string, decision: "APPROVE" | "REJECT", payload?: unknown) =>
      call(
        `${base}/journey/proposals/${proposalId}`,
        decision === "APPROVE" ? { decision, payload } : { decision },
        "POST",
        decision === "APPROVE" ? "Proposta aprovada e registrada." : "Proposta descartada.",
      ),
    changeStage: (stage: JourneyStageKey, action: "approve" | "reopen", confirm?: boolean) =>
      call(`${base}/journey/stages`, { stage, action, confirm }, "POST", action === "approve" ? "Etapa aprovada." : "Etapa reaberta."),
    updateActivity: (id: string, body: unknown) =>
      call(`${base}/activities/${id}`, body, "PATCH", "Atividade atualizada."),
    deleteActivity: (id: string) => call(`${base}/activities/${id}`, { confirm: true }, "DELETE", "Atividade excluída."),
    updateOutcome: (id: string, body: unknown) => call(`${base}/outcomes/${id}`, body, "PATCH", "Resultado atualizado."),
    deleteOutcome: (id: string) => call(`${base}/outcomes/${id}`, { confirm: true }, "DELETE", "Resultado excluído."),
    updateImpact: (body: unknown) => call(`${base}/impact`, body, "PATCH", "Impacto atualizado."),
  };
}

export type JourneyController = ReturnType<typeof useJourney>;
