"use client";

import { useState, useSyncExternalStore } from "react";
import { Check, Copy, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";

const noSubscribe = () => () => {};

/** Abre (em nova aba) ou copia o link de uma página pública. */
export function PublicLinkActions({ path, label }: { path: string; label: string }) {
  const [copied, setCopied] = useState(false);
  // A origem do site só existe no navegador; no servidor o botão de copiar fica desativado.
  const origin = useSyncExternalStore(
    noSubscribe,
    () => window.location.origin,
    () => "",
  );

  async function copy() {
    try {
      await navigator.clipboard.writeText(`${origin}${path}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copie o link:", `${origin}${path}`);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button asChild variant="outline" size="sm">
        <a href={path} target="_blank" rel="noopener noreferrer">
          <Globe aria-hidden /> {label}
        </a>
      </Button>
      <Button variant="ghost" size="sm" onClick={copy} disabled={!origin} aria-label={`Copiar link: ${label}`}>
        {copied ? <Check aria-hidden /> : <Copy aria-hidden />} {copied ? "Copiado" : "Copiar link"}
      </Button>
    </div>
  );
}
