import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/session";
import { stageChangeSchema } from "@/lib/journey/api-schemas";
import { handleRoute, readJson } from "@/server/http";
import { changeStage } from "@/server/journey/service";

/** Aprova a etapa atual ou reabre uma etapa aprovada (com confirmação). */
export async function POST(request: Request, ctx: RouteContext<"/api/projects/[id]/journey/stages">) {
  return handleRoute(async () => {
    const user = await requireApiUser();
    const { id } = await ctx.params;
    const body = stageChangeSchema.parse(await readJson(request));
    return NextResponse.json(await changeStage(user, id, body));
  });
}
