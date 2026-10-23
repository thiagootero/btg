import Link from "next/link";
import { ClipboardList, Route, Sprout } from "lucide-react";
import { Button } from "@/components/ui/button";

export function EmptyProjects({ canCreate }: { canCreate: boolean }) {
  const steps = [
    { icon: ClipboardList, title: "Conte o essencial", text: "Problema, público, território e estratégia do projeto." },
    { icon: Route, title: "Construa a jornada", text: "Com o consultor virtual, organize atividades, resultados de médio prazo e impacto." },
    { icon: Sprout, title: "Saia com um plano", text: "Um relatório claro e um plano de evidências útil para a equipe." },
  ];
  return (
    <section className="mt-10 rounded-2xl border bg-card px-6 py-10 text-center sm:px-10">
      <h2 className="text-xl font-semibold">Organize a lógica de impacto dos seus projetos</h2>
      <p className="mx-auto mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
        A Jornada de Impacto ajuda a equipe a deixar claro o que o projeto faz, quais mudanças espera ver no
        público e como vai acompanhar essas mudanças — sem planilhas burocráticas.
      </p>
      <ol className="mx-auto mt-8 grid max-w-3xl gap-4 text-left sm:grid-cols-3">
        {steps.map((s, i) => (
          <li key={s.title} className="rounded-xl bg-muted/60 p-4">
            <s.icon className="size-5 text-primary" aria-hidden />
            <p className="mt-2 text-sm font-medium">
              {i + 1}. {s.title}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{s.text}</p>
          </li>
        ))}
      </ol>
      {canCreate && (
        <Button asChild size="lg" className="mt-8">
          <Link href="/projetos/novo">Começar o primeiro projeto</Link>
        </Button>
      )}
    </section>
  );
}
