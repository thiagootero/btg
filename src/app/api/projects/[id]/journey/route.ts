import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/session";
import { handleRoute } from "@/server/http";
import { getJourneyView } from "@/server/journey/service";

/** Estado completo da jornada (projeto, conversa e proposta pendente). */
export async function GET(_request: Request, ctx: RouteContext<"/api/projects/[id]/journey">) {
  return handleRoute(async () => {
    const user = await requireApiUser();
    const { id } = await ctx.params;
    return NextResponse.json(await getJourneyView(user, id));
  });
}
