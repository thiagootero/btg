import Link from "next/link";

export default function ProjectNotFound() {
  return (
    <main className="mx-auto max-w-lg px-4 py-20 text-center">
      <h1 className="text-xl font-semibold">Projeto não encontrado</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        O projeto não existe ou não pertence à sua organização.
      </p>
      <Link href="/projetos" className="mt-6 inline-block text-sm font-medium text-primary hover:underline">
        Voltar para Projetos
      </Link>
    </main>
  );
}
