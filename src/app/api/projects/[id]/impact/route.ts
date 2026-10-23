import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/session";
import { handleRoute, readJson } from "@/server/http";
import { updateImpact } from "@/server/journey/edits";

export async function PATCH(request: Request, ctx: RouteContext<"/api/projects/[id]/impact">) {
  return handleRoute(async () => {
    const user = await requireApiUser();
    const { id } = await ctx.params;
    return NextResponse.json(await updateImpact(user, id, await readJson(request)));
  });
}
