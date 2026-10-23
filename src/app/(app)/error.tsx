"use client";

import { Button } from "@/components/ui/button";

/** Erro inesperado: mensagem amigável, sem detalhes técnicos. */
export default function AppError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto max-w-lg px-4 py-20 text-center">
      <h1 className="text-xl font-semibold">Algo não saiu como esperado</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Não conseguimos carregar esta página agora. Seus dados aprovados estão preservados.
      </p>
      <Button className="mt-6" onClick={reset}>
        Tentar novamente
      </Button>
    </main>
  );
}
