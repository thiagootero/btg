"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { authClient } from "@/lib/auth/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormAlert } from "@/components/form/form-alert";

function safeCallback(value: string | null): string {
  return value && value.startsWith("/") && !value.startsWith("//") ? value : "/projetos";
}

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");

    const errors: typeof fieldErrors = {};
    if (!/^\S+@\S+\.\S+$/.test(email)) errors.email = "Informe um e-mail válido.";
    if (!password) errors.password = "Informe a senha.";
    setFieldErrors(errors);
    setError(null);
    if (Object.keys(errors).length) return;

    setPending(true);
    const { error: signInError } = await authClient.signIn.email({ email, password });
    if (signInError) {
      setPending(false);
      setError(
        signInError.status === 429
          ? "Muitas tentativas em pouco tempo. Aguarde um minuto e tente novamente."
          : "E-mail ou senha incorretos. Confira os dados e tente novamente.",
      );
      return;
    }
    router.replace(safeCallback(searchParams.get("callbackUrl")));
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      {error && <FormAlert>{error}</FormAlert>}
      <div className="space-y-2">
        <Label htmlFor="email">E-mail</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          aria-invalid={Boolean(fieldErrors.email)}
          aria-describedby={fieldErrors.email ? "email-error" : undefined}
          className="h-10"
        />
        {fieldErrors.email && (
          <p id="email-error" className="text-sm text-destructive">
            {fieldErrors.email}
          </p>
        )}
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Senha</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          aria-invalid={Boolean(fieldErrors.password)}
          aria-describedby={fieldErrors.password ? "password-error" : undefined}
          className="h-10"
        />
        {fieldErrors.password && (
          <p id="password-error" className="text-sm text-destructive">
            {fieldErrors.password}
          </p>
        )}
      </div>
      <Button type="submit" className="h-10 w-full" disabled={pending}>
        {pending && <Loader2 className="animate-spin" aria-hidden />}
        {pending ? "Entrando…" : "Entrar"}
      </Button>
    </form>
  );
}
