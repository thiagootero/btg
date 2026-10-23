import type { Metadata } from "next";
import { Suspense } from "react";
import { PageLoading } from "@/components/layout/page-loading";
import { JourneyWorkspace } from "@/components/journey/journey-workspace";
import { requireUser } from "@/lib/auth/session";
import { buildViewState } from "@/server/journey/conversation";
import { requireProjectPage } from "@/server/page-guards";

export const metadata: Metadata = { title: "Jornada de Impacto" };

export default function JourneyPage({ params }: PageProps<"/projetos/[id]/jornada">) {
  return (
    <Suspense fallback={<PageLoading label="Carregando a jornada…" />}>
      <Journey params={params} />
    </Suspense>
  );
}

async function Journey({ params }: { params: PageProps<"/projetos/[id]/jornada">["params"] }) {
  const user = await requireUser();
  const { id } = await params;
  const { access } = await requireProjectPage(user, id, "view");
  const view = await buildViewState(id, access === "edit");
  return <JourneyWorkspace initial={view} />;
}
