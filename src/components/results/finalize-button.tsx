"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/form/confirm-dialog";
import { FormAlert } from "@/components/form/form-alert";
import { ApiError, apiFetch } from "@/lib/client/api";

export const FINALIZE_NOTICE =
  "Após a finalização, os resultados poderão compor o relatório do projeto e, futuramente, a vitrine de impacto. Eles continuarão editáveis por usuários autorizados.";

export function FinalizeButton({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function finalize() {
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/projects/${projectId}/results/finalize`, {
        method: "POST",
        body: {},
      });
      setOpen(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Não foi possível finalizar.");
      setOpen(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      {error && <FormAlert>{error}</FormAlert>}
      <p className="text-sm text-muted-foreground">{FINALIZE_NOTICE}</p>
      <Button onClick={() => setOpen(true)} disabled={busy}>
        {busy ? <Loader2 className="animate-spin" aria-hidden /> : <CheckCircle2 aria-hidden />} Finalizar registro de
        resultados
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Finalizar registro de resultados?"
        description={FINALIZE_NOTICE}
        confirmLabel="Finalizar"
        onConfirm={finalize}
      />
    </div>
  );
}
