export default function PublicResultsNotFound() {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center px-4 py-16 text-center">
      <h1 className="text-xl font-semibold">Página pública indisponível</h1>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        O link pode estar incorreto ou a página não existe mais.
      </p>
    </main>
  );
}
