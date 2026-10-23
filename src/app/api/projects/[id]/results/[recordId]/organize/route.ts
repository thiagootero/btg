import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/session";
import { handleRoute, readJson } from "@/server/http";
import { organizeResult } from "@/server/results/service";

/** Salva os dados e pede à IA uma proposta de texto técnico (nunca aprovada automaticamente). */
export async function POST(request: Request, ctx: RouteContext<"/api/projects/[id]/results/[recordId]/organize">) {
  return handleRoute(async () => {
    const user = await requireApiUser();
    const { id, recordId } = await ctx.params;
    return NextResponse.json(await organizeResult(user, id, recordId, await readJson(request)));
  });
}
