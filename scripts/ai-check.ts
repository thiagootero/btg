/**
 * Teste rápido da integração com a OpenAI: faz UMA chamada real com um projeto
 * fictício e mostra a resposta validada e os tokens usados. Não lê nem grava
 * nada no banco e nunca imprime a chave.
 *
 * Uso: npm run ai:check
 * Requer OPENAI_API_KEY (e, opcionalmente, OPENAI_MODEL) no .env ou no ambiente.
 * Cada execução consome tokens da conta configurada.
 */
import { existsSync } from "node:fs";
import { ExternalJourneyAIProvider, readExternalProviderConfig } from "../src/lib/journey-ai/external-provider";
import type { JourneyAIUsage } from "../src/lib/journey-ai/types";
import type { JourneySnapshot } from "../src/lib/journey/types";

if (existsSync(".env")) process.loadEnvFile(".env");

const snapshot: JourneySnapshot = {
  project: {
    id: "teste",
    organizationId: "teste",
    organizationName: "Organização de teste",
    name: "Projeto de teste da integração",
    area: "EDUCACAO",
    areaOther: null,
    areaLabel: "Educação",
    targetAudience: "Crianças de 6 a 10 anos de escolas públicas do bairro",
    durationMonths: 12,
    startDate: null,
    problem: "Muitas crianças chegam ao 3º ano sem ler com autonomia.",
    strategy: null,
    territories: [{ city: "Montes Claros", state: "MG" }],
    isDemo: true,
    updatedAt: new Date().toISOString(),
  },
  approvedStages: ["CONTEXT"],
  currentStage: "ACTIVITIES",
  activities: [],
  outcomes: [],
  impact: null,
  evidencePlan: [],
};

async function main() {
  let config;
  try {
    config = readExternalProviderConfig(process.env);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
    return;
  }
  const usage: JourneyAIUsage[] = [];
  const provider = new ExternalJourneyAIProvider(config, { recordUsage: async (u) => void usage.push(u) });
  console.log(`Chamando a OpenAI (modelo ${config.model})…`);
  try {
    const response = await provider.respond({
      snapshot,
      stage: snapshot.currentStage,
      state: null,
      pendingProposal: null,
      history: [],
      input: { kind: "MESSAGE", text: "Vamos fazer oficinas semanais de leitura com as crianças." },
    });
    console.log("\nResposta validada pelo contrato:");
    console.log(JSON.stringify(response, null, 2));
  } catch (error) {
    const detail = error instanceof Error && "detail" in error ? String(error.detail) : String(error);
    console.error(`\nFalha: ${detail}`);
    process.exitCode = 1;
  } finally {
    console.log("\nUso registrado:", usage);
  }
}

void main();
