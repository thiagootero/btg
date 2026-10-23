import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/session";
import { stageChangeSchema } from "@/lib/journey/api-schemas";
import { resultsUnlocked } from "@/lib/results/status";
import { handleRoute, readJson } from "@/server/http";
import { changeStage } from "@/server/journey/service";
import { schedulePrepareResultsForm } from "@/server/results/service";

/** Aprova a etapa atual ou reabre uma etapa aprovada (com confirmação). */
export async function POST(request: Request, ctx: RouteContext<"/api/projects/[id]/journey/stages">) {
  return handleRoute(async () => {
    const user = await requireApiUser();
    const { id } = await ctx.params;
    const body = stageChangeSchema.parse(await readJson(request));
    const view = await changeStage(user, id, body);
    // Jornada concluída: as perguntas personalizadas dos Resultados são geradas
    // uma única vez, em segundo plano (a geração ignora avaliações que já as têm).
    if (body.action === "approve" && resultsUnlocked(view.snapshot.approvedStages)) schedulePrepareResultsForm(id);
    return NextResponse.json(view);
  });
}
