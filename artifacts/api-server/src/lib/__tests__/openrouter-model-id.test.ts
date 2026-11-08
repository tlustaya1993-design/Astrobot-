import { afterEach, describe, expect, it } from "vitest";
import {
  hasClaudeProvider,
  isOpenRouterProvider,
  resolveClaudeModelId,
} from "@workspace/integrations-anthropic-ai";

describe("OpenRouter Claude model ids", () => {
  const prev = {
    OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    AI_INTEGRATIONS_ANTHROPIC_API_KEY: process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY,
  };

  afterEach(() => {
    for (const [key, value] of Object.entries(prev)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it("prefers OPENROUTER_API_KEY for provider detection", () => {
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY;
    process.env.OPENROUTER_API_KEY = "sk-or-test";
    expect(isOpenRouterProvider()).toBe(true);
    expect(hasClaudeProvider()).toBe(true);
  });

  it("maps bare Anthropic ids to OpenRouter slugs", () => {
    process.env.OPENROUTER_API_KEY = "sk-or-test";
    expect(resolveClaudeModelId("claude-haiku-4-5")).toBe("anthropic/claude-haiku-4.5");
    expect(resolveClaudeModelId("claude-sonnet-4-6")).toBe("anthropic/claude-sonnet-4.6");
    expect(resolveClaudeModelId("anthropic/claude-sonnet-4.5")).toBe(
      "anthropic/claude-sonnet-4.5",
    );
  });

  it("leaves bare ids unchanged without OpenRouter", () => {
    delete process.env.OPENROUTER_API_KEY;
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    expect(isOpenRouterProvider()).toBe(false);
    expect(resolveClaudeModelId("claude-haiku-4-5")).toBe("claude-haiku-4-5");
  });
});
