import "server-only";

import { env } from "@/lib/env";
import type { AiRuntimeConfig, AiRuntimeCredentials } from "@/lib/types";

export function getAiRuntimeConfig(): AiRuntimeConfig {
  return {
    provider: env.AI_PROVIDER,
    model: env.AI_MODEL,
    baseUrl: env.AI_BASE_URL?.trim() || "",
    hasApiKey: env.AI_API_KEY.trim().length > 0
  };
}

export function getAiRuntimeCredentials(): AiRuntimeCredentials {
  return {
    provider: env.AI_PROVIDER,
    model: env.AI_MODEL,
    baseUrl: env.AI_BASE_URL?.trim() || "",
    apiKey: env.AI_API_KEY?.trim() || ""
  };
}
