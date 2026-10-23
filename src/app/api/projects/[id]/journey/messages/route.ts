import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/session";
import { journeyInputSchema } from "@/lib/journey/api-schemas";
import { handleRoute, readJson } from "@/server/http";
import { postJourneyInput } from "@/server/journey/service";

/**
 * Centraliza a conversa com o consultor virtual: valida acesso e entrada,
 * grava a mensagem, chama o provedor de IA e persiste a resposta/proposta.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/projects/[id]/journey/messages">) {
  return handleRoute(async () => {
    const user = await requireApiUser();
    const { id } = await ctx.params;
    const input = journeyInputSchema.parse(await readJson(request));
    return NextResponse.json(await postJourneyInput(user, id, input));
  });
}
