import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/session";
import { handleRoute, readJson } from "@/server/http";
import { updateResultRecord } from "@/server/results/service";

/** Salvar rascunho, aprovar o texto técnico ou descartar a proposta da IA. */
export async function PATCH(request: Request, ctx: RouteContext<"/api/projects/[id]/results/[recordId]">) {
  return handleRoute(async () => {
    const user = await requireApiUser();
    const { id, recordId } = await ctx.params;
    return NextResponse.json(await updateResultRecord(user, id, recordId, await readJson(request)));
  });
}
