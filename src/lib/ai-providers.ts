export const AI_PROVIDERS = [
  { id: "groq", label: "Groq (Recommended)", endpoint: "https://api.groq.com/openai/v1/chat/completions", defaultModel: "openai/gpt-oss-120b" },
  { id: "openai", label: "OpenAI", endpoint: "https://api.openai.com/v1/chat/completions", defaultModel: "gpt-4o" },
  { id: "anthropic", label: "Anthropic (Claude)", endpoint: "https://api.anthropic.com/v1/messages", defaultModel: "claude-3-5-sonnet-latest" },
  { id: "google", label: "Google (Gemini)", endpoint: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", defaultModel: "gemini-2.0-flash" },
  { id: "custom", label: "Custom / Self-hosted", endpoint: null, defaultModel: "" },
] as const;

export function findAiProvider(providerId: string) {
  return AI_PROVIDERS.find((provider) => provider.id === providerId);
}

export function resolveAiEndpoint(providerId: string, customEndpoint?: string) {
  const provider = findAiProvider(providerId);
  if (!provider) throw new Error("Choose a supported AI provider.");
  if (provider.endpoint) return provider.endpoint;
  const endpoint = customEndpoint?.trim();
  if (!endpoint) throw new Error("Endpoint URL is required for Custom / Self-hosted.");
  return endpoint;
}
