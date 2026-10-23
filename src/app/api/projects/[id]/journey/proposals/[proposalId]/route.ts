import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/session";
import { proposalDecisionSchema } from "@/lib/journey/api-schemas";
import { handleRoute, readJson } from "@/server/http";
import { decideProposal } from "@/server/journey/service";

/** Aprova (com ou sem edição) ou rejeita uma proposta pendente. */
export async function POST(
  request: Request,
  ctx: RouteContext<"/api/projects/[id]/journey/proposals/[proposalId]">,
) {
  return handleRoute(async () => {
    const user = await requireApiUser();
    const { id, proposalId } = await ctx.params;
    const decision = proposalDecisionSchema.parse(await readJson(request));
    return NextResponse.json(await decideProposal(user, id, proposalId, decision));
  });
}
