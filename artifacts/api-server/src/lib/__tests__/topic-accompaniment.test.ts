import { describe, expect, it } from "vitest";
import {
  analyzeTopicAccompaniment,
  buildTopicAccompanimentPromptBlock,
  detectTopicBuckets,
  hasDoubtSignals,
} from "../topic-accompaniment.js";

describe("detectTopicBuckets", () => {
  it("detects money and work themes", () => {
    expect(detectTopicBuckets("А вдруг я останусь без денег?")).toContain("money");
    expect(detectTopicBuckets("А если меня никто не наймёт?")).toContain("work");
  });
});

describe("hasDoubtSignals", () => {
  it("detects anxiety follow-ups", () => {
    expect(hasDoubtSignals("А вдруг я останусь без денег?")).toBe(true);
    expect(hasDoubtSignals("Расскажи про транзит Юпитера")).toBe(false);
  });
});

describe("analyzeTopicAccompaniment", () => {
  const moneySpiral = [
    "Боюсь остаться без денег",
    "А вдруг я останусь без денег?",
    "А если меня никто не наймёт?",
    "А если AstroBot не взлетит?",
  ];

  it("stays fresh on the first user turn", () => {
    const a = analyzeTopicAccompaniment(["Боюсь остаться без денег"]);
    expect(a.mode).toBe("fresh");
    expect(a.isSameTopicThread).toBe(false);
  });

  it("detects ongoing topic thread on related fear questions", () => {
    const a = analyzeTopicAccompaniment(moneySpiral);
    expect(a.isSameTopicThread).toBe(true);
    expect(["ongoing", "recheck"]).toContain(a.mode);
    expect(a.sharedTopicLabels.length).toBeGreaterThan(0);
  });

  it("enters recheck when user keeps doubting", () => {
    const a = analyzeTopicAccompaniment(moneySpiral);
    expect(a.mode).toBe("recheck");
    expect(a.hasDoubtSignals).toBe(true);
  });

  it("does not treat unrelated topics as one thread", () => {
    const a = analyzeTopicAccompaniment([
      "Какой у меня асцендент?",
      "Когда лучше переехать в другой город?",
    ]);
    expect(a.isSameTopicThread).toBe(false);
    expect(a.mode).toBe("fresh");
  });
});

describe("buildTopicAccompanimentPromptBlock", () => {
  it("returns null for fresh conversations", () => {
    expect(
      buildTopicAccompanimentPromptBlock(
        analyzeTopicAccompaniment(["Первый вопрос про деньги"]),
      ),
    ).toBeNull();
  });

  it("includes central conclusion and recheck rules", () => {
    const block = buildTopicAccompanimentPromptBlock(
      analyzeTopicAccompaniment([
        "Боюсь остаться без денег",
        "А вдруг я останусь без денег?",
        "А если меня никто не наймёт?",
      ]),
    );
    expect(block).toContain("РЕЖИМ СОПРОВОЖДЕНИЯ ОДНОЙ ТЕМЫ");
    expect(block).toContain("Центральный вывод");
    expect(block).toContain("СНАЧАЛА заново посмотри в карту");
    expect(block).toContain("РЕЖИМ ПЕРЕПРОВЕРКИ");
    expect(block).toContain("без лестницы методов");
  });
});
