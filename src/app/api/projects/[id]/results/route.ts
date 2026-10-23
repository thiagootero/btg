import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/session";
import { handleRoute } from "@/server/http";
import { getResultsView } from "@/server/results/service";

export async function GET(_request: Request, ctx: RouteContext<"/api/projects/[id]/results">) {
  return handleRoute(async () => {
    const user = await requireApiUser();
    const { id } = await ctx.params;
    return NextResponse.json(await getResultsView(user, id));
  });
}
