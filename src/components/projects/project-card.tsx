import Link from "next/link";
import { CalendarClock, MapPin, Timer } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { areaLabel, type ProjectAreaKey } from "@/lib/journey/areas";
import { formatDuration, formatTerritories } from "@/lib/journey/format";
import { stageNumber, STAGE_SHORT_LABELS, type JourneyStageKey } from "@/lib/journey/stages";

interface ProjectCardData {
  id: string;
  name: string;
  area: ProjectAreaKey;
  areaOther: string | null;
  durationMonths: number;
  currentStage: JourneyStageKey;
  journeyStatus: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED";
  isDemo: boolean;
  updatedAt: Date;
  organization: { name: string };
  territories: { city: string; state: string }[];
}

export function journeyStatusLabel(status: ProjectCardData["journeyStatus"], stage: JourneyStageKey): string {
  // Por ora a jornada termina no impacto (o plano de evidências está fora do fluxo).
  if (status === "COMPLETED" || stage === "EVIDENCE_PLAN") return "Jornada concluída";
  if (status === "NOT_STARTED") return "Jornada não iniciada";
  return `Etapa ${stageNumber(stage)} · ${STAGE_SHORT_LABELS[stage]}`;
}

const dateFormat = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric" });

export function ProjectCard({ project, showOrganization }: { project: ProjectCardData; showOrganization: boolean }) {
  const completed = project.journeyStatus === "COMPLETED" || project.currentStage === "EVIDENCE_PLAN";
  return (
    <Link
      href={`/projetos/${project.id}/jornada`}
      className="group flex h-full flex-col rounded-xl border bg-card p-5 shadow-xs transition hover:border-primary/40 hover:shadow-sm"
    >
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary">{areaLabel(project.area, project.areaOther)}</Badge>
        {project.isDemo && <Badge variant="outline">Demonstração</Badge>}
      </div>
      <h2 className="mt-3 text-base font-semibold leading-snug group-hover:text-primary">{project.name}</h2>
      {showOrganization && <p className="mt-0.5 text-xs text-muted-foreground">{project.organization.name}</p>}
      <dl className="mt-4 space-y-1.5 text-sm text-muted-foreground">
        <div className="flex items-start gap-2">
          <dt className="sr-only">Territórios</dt>
          <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden />
          <dd>{formatTerritories(project.territories) || "—"}</dd>
        </div>
        <div className="flex items-center gap-2">
          <dt className="sr-only">Duração</dt>
          <Timer className="size-4 shrink-0" aria-hidden />
          <dd>{formatDuration(project.durationMonths)}</dd>
        </div>
        <div className="flex items-center gap-2">
          <dt className="sr-only">Atualizado em</dt>
          <CalendarClock className="size-4 shrink-0" aria-hidden />
          <dd>Atualizado em {dateFormat.format(project.updatedAt)}</dd>
        </div>
      </dl>
      <div className="mt-auto pt-5">
        <span
          className={
            completed
              ? "inline-flex rounded-full bg-success-soft px-2.5 py-1 text-xs font-medium text-success"
              : "inline-flex rounded-full bg-secondary px-2.5 py-1 text-xs font-medium text-secondary-foreground"
          }
        >
          {journeyStatusLabel(project.journeyStatus, project.currentStage)}
        </span>
      </div>
    </Link>
  );
}
