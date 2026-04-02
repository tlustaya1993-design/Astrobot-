import Anthropic from "@anthropic-ai/sdk";

const apiKey =
  process.env.ANTHROPIC_API_KEY ||
  process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY;

if (!apiKey) {
  throw new Error(
    "Anthropic API key is required. Set ANTHROPIC_API_KEY environment variable.",
  );
}

export const anthropic = new Anthropic({ apiKey });
