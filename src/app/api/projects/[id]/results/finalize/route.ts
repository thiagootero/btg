import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/session";
import { handleRoute } from "@/server/http";
import { finalizeEvaluation } from "@/server/results/service";

export async function POST(_request: Request, ctx: RouteContext<"/api/projects/[id]/results/finalize">) {
  return handleRoute(async () => {
    const user = await requireApiUser();
    const { id } = await ctx.params;
    return NextResponse.json(await finalizeEvaluation(user, id));
  });
}
