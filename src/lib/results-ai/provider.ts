import { readExternalProviderConfig } from "@/lib/journey-ai/external-provider";
import { aiProviderMode } from "@/lib/journey-ai/provider";
import { ExternalResultTextProvider, type ExternalResultOptions } from "@/lib/results-ai/external-provider";
import { MockResultTextProvider } from "@/lib/results-ai/mock-provider";
import type { ResultTextProvider } from "@/lib/results-ai/types";

/** Mesma feature flag do consultor: AI_PROVIDER=mock|external. */
export function getResultTextProvider(
  env: Record<string, string | undefined> = process.env,
  options: ExternalResultOptions = {},
): ResultTextProvider {
  if (aiProviderMode(env) === "external") {
    return new ExternalResultTextProvider(readExternalProviderConfig(env), options);
  }
  return new MockResultTextProvider();
}
