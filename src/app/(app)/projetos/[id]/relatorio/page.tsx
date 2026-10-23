import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowLeft } from "lucide-react";
import { PageLoading } from "@/components/layout/page-loading";
import { PrintButton } from "@/components/report/print-button";
import { IMPACT_OPTION_LABELS } from "@/lib/journey/proposal-schemas";
import { requireUser } from "@/lib/auth/session";
import {
  activityLines,
  formatDuration,
  formatTerritories,
  outcomeLines,
  reportStrategyText,
  stripTrailingPeriod,
  twoDigits,
} from "@/lib/journey/format";
import { displayOrDefine } from "@/lib/journey/progress";
import type { JourneySnapshot } from "@/lib/journey/types";
import { loadSnapshot } from "@/server/journey/snapshot";
import { requireProjectPage } from "@/server/page-guards";

export const metadata: Metadata = { title: "Relatório geral" };

export default function ReportPage({ params }: PageProps<"/projetos/[id]/relatorio">) {
  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6 print:max-w-none print:p-0">
      <Suspense fallback={<PageLoading label="Montando o relatório…" />}>
        <Report params={params} />
      </Suspense>
    </main>
  );
}

function Lines({ lines }: { lines: Array<[string, string]> }) {
  return (
    <dl className="space-y-1 text-sm leading-relaxed">
      {lines.map(([k, v]) => (
        <div key={k}>
          <dt className="inline font-semibold">{k}: </dt>
          <dd className="inline">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function Section({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="print-avoid-break mt-10 first:mt-0" aria-labelledby={`sec-${n}`}>
      <h2 id={`sec-${n}`} className="border-b pb-2 text-lg font-semibold">
        {n}. {title}
      </h2>
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

const Pending = ({ text }: { text: string }) => <p className="text-sm italic text-muted-foreground">{text}</p>;

async function Report({ params }: { params: PageProps<"/projetos/[id]/relatorio">["params"] }) {
  const user = await requireUser();
  const { id } = await params;
  await requireProjectPage(user, id, "view");
  const snapshot: JourneySnapshot = await loadSnapshot(id);
  const { project, activities, outcomes, impact, evidencePlan } = snapshot;

  const strategyText = reportStrategyText(project.strategy, activities);
  const contextLines: Array<[string, string]> = [
    ["Organização", project.organizationName],
    ["Área do projeto", project.areaLabel],
    ["Território", formatTerritories(project.territories)],
    ["Público-alvo", project.targetAudience],
    ["Duração", formatDuration(project.durationMonths)],
  ];
  // A data de início só aparece quando informada.
  if (project.startDate) {
    const [y, m, d] = project.startDate.split("-");
    contextLines.push(["Início", `${d}/${m}/${y}`]);
  }

  return (
    <article>
      <div className="no-print mb-8 flex flex-wrap items-center justify-between gap-3">
        <Link href={`/projetos/${id}/jornada`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" aria-hidden /> Voltar à jornada
        </Link>
        <PrintButton />
      </div>

      <header className="mb-10">
        <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Jornada de Impacto · BTG Soma</p>
        <h1 className="mt-2 text-2xl font-semibold leading-tight tracking-tight">
          Relatório Geral — Jornada de Impacto do Projeto {project.name}
        </h1>
        {project.isDemo && (
          <p className="mt-3 rounded-md border border-warning/40 bg-warning-soft px-3 py-2 text-xs text-warning">
            Conteúdo de demonstração (dados fictícios).
          </p>
        )}
        {snapshot.currentStage && (
          <p className="no-print mt-3 text-xs text-muted-foreground">
            A jornada ainda está em construção: seções sem conteúdo aprovado aparecem como pendentes.
          </p>
        )}
      </header>

      <Section n={1} title="Contexto do projeto">
        <Lines lines={contextLines} />
        <div className="text-sm leading-relaxed">
          <h3 className="font-semibold">Problema enfrentado</h3>
          <p className="mt-1 whitespace-pre-line">{project.problem}</p>
        </div>
        {strategyText && (
          <div className="text-sm leading-relaxed">
            <h3 className="font-semibold">Estratégia</h3>
            <p className="mt-1">{strategyText}</p>
          </div>
        )}
      </Section>

      <Section n={2} title="Atividades e Resultados">
        {activities.length === 0 && <Pending text="Atividades ainda não aprovadas." />}
        {activities.map((a, i) => (
          <div key={a.id} className="print-avoid-break rounded-lg border p-4 print:border-0 print:p-0">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Atividade {twoDigits(i + 1)}</p>
            <Lines lines={activityLines(a)} />
          </div>
        ))}
      </Section>

      <Section n={3} title="Resultados de Médio Prazo">
        {outcomes.length === 0 && <Pending text="Resultados de médio prazo ainda não aprovados." />}
        {outcomes.map((o, i) => (
          <div key={o.id} className="print-avoid-break rounded-lg border p-4 print:border-0 print:p-0">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Resultado {twoDigits(i + 1)}</p>
            <Lines lines={outcomeLines(o)} />
          </div>
        ))}
      </Section>

      <Section n={4} title="Impacto de longo prazo">
        {!impact ? (
          <Pending text="Impacto de longo prazo ainda não aprovado." />
        ) : (
          <>
            <p className="text-sm leading-relaxed">{stripTrailingPeriod(impact.statement)}.</p>
            {impact.followUpOption && (
              <p className="text-sm">
                <span className="font-semibold">Acompanhamento: </span>
                {IMPACT_OPTION_LABELS[impact.followUpOption]}.
              </p>
            )}
            {impact.followUps.map((f) => (
              <Lines
                key={f.id}
                lines={[
                  [impact.followUpOption === "FUTURE_EVALUATION" ? "Avaliação" : "Mudança acompanhada", stripTrailingPeriod(f.description)],
                  ["Meta", displayOrDefine(f.target)],
                  ["Indicador", displayOrDefine(f.indicator)],
                  ["Meio de verificação", displayOrDefine(f.verification)],
                  ["Período", displayOrDefine(f.periodAfterEnd)],
                  ...(f.notes ? ([["Observações", f.notes]] as Array<[string, string]>) : []),
                ]}
              />
            ))}
          </>
        )}
      </Section>

      <Section n={5} title="Plano de evidências">
        {evidencePlan.length === 0 ? (
          <Pending text="Plano de evidências ainda não consolidado." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs">
              <caption className="sr-only">Plano de evidências</caption>
              <thead>
                <tr className="border-b">
                  {["Relacionado a", "Meta", "Indicador", "Meio de verificação", "Quando", "Quem registra", "Instrumento", "Pendências"].map((h) => (
                    <th key={h} scope="col" className="px-2 py-2 font-semibold">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {evidencePlan.map((item) => (
                  <tr key={item.id} className="print-avoid-break border-b align-top">
                    <th scope="row" className="px-2 py-2 font-medium">{item.sourceLabel}</th>
                    <td className="px-2 py-2">{displayOrDefine(item.target)}</td>
                    <td className="px-2 py-2">{displayOrDefine(item.indicator)}</td>
                    <td className="px-2 py-2">{displayOrDefine(item.verification)}</td>
                    <td className="px-2 py-2">{displayOrDefine(item.collectionTiming)}</td>
                    <td className="px-2 py-2">{displayOrDefine(item.responsible)}</td>
                    <td className="px-2 py-2">{displayOrDefine(item.instrument)}</td>
                    <td className="px-2 py-2">{item.pending ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </article>
  );
}
