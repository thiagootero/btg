import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/session";
import { handleRoute } from "@/server/http";
import { reconsolidateEvidencePlan } from "@/server/journey/edits";

/** Reconsolida o plano a partir do conteúdo aprovado, preservando os campos operacionais. */
export async function POST(_request: Request, ctx: RouteContext<"/api/projects/[id]/evidence-plan">) {
  return handleRoute(async () => {
    const user = await requireApiUser();
    const { id } = await ctx.params;
    return NextResponse.json(await reconsolidateEvidencePlan(user, id));
  });
}
