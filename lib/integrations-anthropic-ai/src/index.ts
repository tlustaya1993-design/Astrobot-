import Anthropic from "@anthropic-ai/sdk";

const OPENROUTER_DEFAULT_BASE_URL = "https://openrouter.ai/api";
const OPENROUTER_DEFAULT_TITLE = "AstroBot";

let cachedClient: Anthropic | null = null;
let cachedMode: "openrouter" | "anthropic" | null = null;

export function getOpenRouterApiKey(): string | undefined {
  const key = process.env.OPENROUTER_API_KEY?.trim();
  return key || undefined;
}

function getDirectAnthropicApiKey(): string | undefined {
  return (
    process.env.ANTHROPIC_API_KEY?.trim() ||
    process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY?.trim() ||
    undefined
  );
}

/** True when Claude calls can run (OpenRouter preferred, else direct Anthropic). */
export function hasClaudeProvider(): boolean {
  return Boolean(getOpenRouterApiKey() || getDirectAnthropicApiKey());
}

export function isOpenRouterProvider(): boolean {
  return Boolean(getOpenRouterApiKey());
}

/**
 * Map bare Anthropic model ids to OpenRouter slugs when routing via OpenRouter.
 * Env overrides that already contain `/` (e.g. anthropic/claude-sonnet-4.5) pass through.
 * Does not switch model families — only adapts id format for the gateway.
 */
export function resolveClaudeModelId(model: string): string {
  const trimmed = model.trim();
  if (!trimmed) return trimmed;
  if (!isOpenRouterProvider()) return trimmed;
  if (trimmed.includes("/")) return trimmed;

  // claude-haiku-4-5 → anthropic/claude-haiku-4.5
  const dotted = trimmed.replace(
    /^(claude-(?:haiku|sonnet|opus))-(\d+)-(\d+)(.*)$/i,
    "anthropic/$1-$2.$3$4",
  );
  if (dotted !== trimmed) return dotted;

  return `anthropic/${trimmed}`;
}

function openRouterBaseUrl(): string {
  return (
    process.env.OPENROUTER_BASE_URL?.trim().replace(/\/+$/, "") ||
    OPENROUTER_DEFAULT_BASE_URL
  );
}

function openRouterDefaultHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  const referer =
    process.env.OPENROUTER_HTTP_REFERER?.trim() ||
    process.env.PUBLIC_ORIGIN?.trim() ||
    process.env.VITE_PUBLIC_ORIGIN?.trim() ||
    process.env.OAUTH_REDIRECT_BASE_URL?.trim();
  if (referer) headers["HTTP-Referer"] = referer;
  headers["X-Title"] =
    process.env.OPENROUTER_APP_TITLE?.trim() || OPENROUTER_DEFAULT_TITLE;
  return headers;
}

export function getAnthropic(): Anthropic {
  const openRouterKey = getOpenRouterApiKey();
  const mode: "openrouter" | "anthropic" = openRouterKey ? "openrouter" : "anthropic";

  if (cachedClient && cachedMode === mode) return cachedClient;

  if (openRouterKey) {
    cachedClient = new Anthropic({
      apiKey: openRouterKey,
      baseURL: openRouterBaseUrl(),
      defaultHeaders: openRouterDefaultHeaders(),
    });
    cachedMode = "openrouter";
    return cachedClient;
  }

  const apiKey = getDirectAnthropicApiKey();
  if (!apiKey) {
    throw new Error(
      "Claude API key is required. Set OPENROUTER_API_KEY (preferred) or ANTHROPIC_API_KEY.",
    );
  }

  cachedClient = new Anthropic({ apiKey });
  cachedMode = "anthropic";
  return cachedClient;
}

/** @deprecated Prefer hasClaudeProvider() — name kept for older call sites. */
export function hasAnthropicProvider(): boolean {
  return hasClaudeProvider();
}

// Keep backward compatibility with existing imports (`import { anthropic } ...`)
// but avoid throwing at module import time when API key is not configured.
export const anthropic = new Proxy({} as Anthropic, {
  get(_target, prop, receiver) {
    const client = getAnthropic() as unknown as object;
    const value = Reflect.get(client, prop, receiver);
    return typeof value === "function" ? value.bind(client) : value;
  },
});
