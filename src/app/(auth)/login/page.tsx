import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginForm } from "@/components/auth/login-form";
import { BrandMark } from "@/components/layout/brand";

export const metadata: Metadata = { title: "Entrar" };

export default function LoginPage() {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center text-center">
          <BrandMark size="lg" />
          <h1 className="mt-6 text-2xl font-semibold tracking-tight">Jornada de Impacto</h1>
          <p className="mt-1 text-sm text-muted-foreground">Programa BTG Soma</p>
        </div>
        <div className="rounded-xl border bg-card p-6 shadow-sm sm:p-8">
          <h2 className="text-lg font-medium">Entrar na plataforma</h2>
          <p className="mt-1 mb-6 text-sm text-muted-foreground">
            Use o e-mail e a senha cadastrados para a sua organização.
          </p>
          <Suspense>
            <LoginForm />
          </Suspense>
        </div>
        <p className="mt-6 text-center text-xs text-muted-foreground">
          Não tem acesso? Fale com a pessoa administradora da sua organização.
        </p>
      </div>
    </main>
  );
}
