import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/session";
import { handleRoute, readJson } from "@/server/http";
import { updateEvidencePlanItem } from "@/server/journey/edits";

export async function PATCH(request: Request, ctx: RouteContext<"/api/projects/[id]/evidence-plan/[itemId]">) {
  return handleRoute(async () => {
    const user = await requireApiUser();
    const { id, itemId } = await ctx.params;
    return NextResponse.json(await updateEvidencePlanItem(user, id, itemId, await readJson(request)));
  });
}
