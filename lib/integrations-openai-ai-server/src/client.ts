import OpenAI from "openai";

// On Replit: uses AI Integrations proxy (AI_INTEGRATIONS_OPENAI_*)
// On Railway/self-hosted: uses standard OPENAI_API_KEY
const apiKey =
  process.env.AI_INTEGRATIONS_OPENAI_API_KEY ||
  process.env.OPENAI_API_KEY;

const baseURL =
  process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || undefined;

if (!apiKey) {
  throw new Error(
    "OpenAI API key is required. Set OPENAI_API_KEY environment variable.",
  );
}

export const openai = new OpenAI({ apiKey, baseURL });
