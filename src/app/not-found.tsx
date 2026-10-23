import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto max-w-lg px-4 py-20 text-center">
      <h1 className="text-xl font-semibold">Página não encontrada</h1>
      <p className="mt-2 text-sm text-muted-foreground">O endereço não existe ou você não tem acesso a ele.</p>
      <Link href="/projetos" className="mt-6 inline-block text-sm font-medium text-primary hover:underline">
        Ir para Projetos
      </Link>
    </main>
  );
}
