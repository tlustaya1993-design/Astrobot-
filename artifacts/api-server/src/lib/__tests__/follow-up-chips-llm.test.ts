import { describe, expect, it } from "vitest";
import {
  detectInvitationHookTail,
  extractJsonArrayPayload,
  parseFollowUpChipsFromLlm,
} from "../follow-up-chips-llm.js";

describe("detectInvitationHookTail", () => {
  it("detects «могу пойти глубже» in tail", () => {
    const text =
      "Краткий разбор.\n\nЕсли хочешь — могу пойти глубже в транзиты.";
    expect(detectInvitationHookTail(text)).toBe(true);
  });

  it("ignores hook phrase outside tail window", () => {
    const prefix = "могу пойти глубже ".repeat(80);
    const text = `${prefix}\n\nФинал без приглашения.`;
    expect(detectInvitationHookTail(text)).toBe(false);
  });
});

describe("parseFollowUpChipsFromLlm", () => {
  it("parses fenced JSON array", () => {
    const raw = '```json\n["Как соляр влияет на карьеру сейчас?"]\n```';
    expect(parseFollowUpChipsFromLlm(raw)).toEqual([
      "Как соляр влияет на карьеру сейчас?",
    ]);
  });

  it("drops generic templates", () => {
    expect(parseFollowUpChipsFromLlm('["Расскажи подробнее"]')).toEqual([]);
  });

  it("returns [] on invalid JSON", () => {
    expect(parseFollowUpChipsFromLlm("not json")).toEqual([]);
  });
});

describe("extractJsonArrayPayload", () => {
  it("extracts array from prose wrapper", () => {
    expect(extractJsonArrayPayload('Вот: ["A?", "B?"]')).toBe('["A?", "B?"]');
  });
});
