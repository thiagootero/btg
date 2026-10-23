import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/session";
import { deleteConfirmSchema } from "@/lib/journey/api-schemas";
import { handleRoute, readJson } from "@/server/http";
import { deleteOutcome, updateOutcome } from "@/server/journey/edits";

type Ctx = RouteContext<"/api/projects/[id]/outcomes/[outcomeId]">;

export async function PATCH(request: Request, ctx: Ctx) {
  return handleRoute(async () => {
    const user = await requireApiUser();
    const { id, outcomeId } = await ctx.params;
    return NextResponse.json(await updateOutcome(user, id, outcomeId, await readJson(request)));
  });
}

export async function DELETE(request: Request, ctx: Ctx) {
  return handleRoute(async () => {
    const user = await requireApiUser();
    const { id, outcomeId } = await ctx.params;
    deleteConfirmSchema.parse(await readJson(request));
    return NextResponse.json(await deleteOutcome(user, id, outcomeId));
  });
}
