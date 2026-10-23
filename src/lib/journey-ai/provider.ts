import {
  ExternalJourneyAIProvider,
  JourneyAIConfigurationError,
  JourneyAIProviderError,
  readExternalProviderConfig,
  type ExternalProviderOptions,
} from "@/lib/journey-ai/external-provider";
import { MockJourneyAIProvider } from "@/lib/journey-ai/mock-provider";
import type { JourneyAIProvider } from "@/lib/journey-ai/types";

export type AIProviderMode = "mock" | "external";

/** Feature flag AI_PROVIDER=mock|external (padrão: mock). */
export function aiProviderMode(env: Record<string, string | undefined> = process.env): AIProviderMode {
  const value = (env.AI_PROVIDER ?? "mock").trim().toLowerCase();
  if (value === "mock" || value === "") return "mock";
  if (value === "external") return "external";
  throw new JourneyAIConfigurationError(`Valor inválido para AI_PROVIDER: "${value}". Use "mock" ou "external".`);
}

export function getJourneyAIProvider(
  env: Record<string, string | undefined> = process.env,
  options: ExternalProviderOptions = {},
): JourneyAIProvider {
  if (aiProviderMode(env) === "external") {
    return new ExternalJourneyAIProvider(readExternalProviderConfig(env), options);
  }
  return new MockJourneyAIProvider();
}

export { JourneyAIConfigurationError, JourneyAIProviderError };
