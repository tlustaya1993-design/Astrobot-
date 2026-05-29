import { describe, it, expect } from "vitest";
import {
  extractSignalsFromResponse,
  extractLastHookTopic,
  dedupeSignals,
  parseUsedSignalsJson,
} from "../dialogState.js";

const SAMPLE_RESPONSE = `По карте сейчас главный вектор — перестройка работы и дохода, не катастрофа.

✦ Транзитный Юпитер △ натальное Солнце (орб 0.3°, точный) → расширение карьерного потенциала
✦ Плутон ⚹ натальный Марс во 2-м доме (орб 0.5°, пик 13 июля) → трансформация формата заработка
✦ Прогрессированное Солнце ☌ прогрессированный Марс (нарастает) → внутренняя энергия действия усиливается

Хочешь посмотрим на Сатурн в соединении с Луной в 4-м доме?`;

describe("extractSignalsFromResponse", () => {
  it("parses three ✦ lines from a realistic response", () => {
    const signals = extractSignalsFromResponse(SAMPLE_RESPONSE);
    expect(signals).toHaveLength(3);
    expect(signals[0]).toContain("Юпитер");
    expect(signals[0]).toContain("Солнце");
    expect(signals[1]).toContain("Плутон");
    expect(signals[2]).toContain("Солнце");
  });

  it("returns empty array when there is no ✦ block", () => {
    expect(extractSignalsFromResponse("Только основной текст без астроблока.")).toEqual([]);
  });
});

describe("dedupeSignals", () => {
  it("merges synonymous Jupiter-Sun aspects into one entry", () => {
    const merged = dedupeSignals(
      ["Юпитер трин Солнце"],
      ["транзитный Юпитер △ Солнце"],
    );
    expect(merged).toHaveLength(1);
  });

  it("caps at 30 signals and keeps the newest", () => {
    const existing = Array.from({ length: 29 }, (_, i) => `сигнал ${i}`);
    const merged = dedupeSignals(existing, ["сигнал 29", "сигнал 30"]);
    expect(merged).toHaveLength(30);
    expect(merged[0]).toBe("сигнал 1");
    expect(merged[29]).toBe("сигнал 30");
  });
});

describe("parseUsedSignalsJson", () => {
  it("returns empty array for invalid JSON", () => {
    expect(parseUsedSignalsJson("{not json")).toEqual([]);
    expect(parseUsedSignalsJson(null)).toEqual([]);
  });

  it("parses a valid JSON array", () => {
    expect(parseUsedSignalsJson('["Юпитер трин Солнце","Марс"]')).toEqual([
      "Юпитер трин Солнце",
      "Марс",
    ]);
  });
});

describe("extractLastHookTopic", () => {
  it("returns the last question with an astro term", () => {
    const topic = extractLastHookTopic(SAMPLE_RESPONSE);
    expect(topic).toContain("?");
    expect(topic).toMatch(/сатурн/i);
  });

  it("returns null when there is no hook question with astro terms", () => {
    expect(extractLastHookTopic("Как дела? Всё нормально.")).toBeNull();
  });
});
