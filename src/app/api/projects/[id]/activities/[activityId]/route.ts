import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/session";
import { deleteConfirmSchema } from "@/lib/journey/api-schemas";
import { handleRoute, readJson } from "@/server/http";
import { deleteActivity, updateActivity } from "@/server/journey/edits";

type Ctx = RouteContext<"/api/projects/[id]/activities/[activityId]">;

export async function PATCH(request: Request, ctx: Ctx) {
  return handleRoute(async () => {
    const user = await requireApiUser();
    const { id, activityId } = await ctx.params;
    return NextResponse.json(await updateActivity(user, id, activityId, await readJson(request)));
  });
}

export async function DELETE(request: Request, ctx: Ctx) {
  return handleRoute(async () => {
    const user = await requireApiUser();
    const { id, activityId } = await ctx.params;
    deleteConfirmSchema.parse(await readJson(request));
    return NextResponse.json(await deleteActivity(user, id, activityId));
  });
}
