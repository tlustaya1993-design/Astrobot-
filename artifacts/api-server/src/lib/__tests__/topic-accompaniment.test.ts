import { describe, expect, it } from "vitest";
import {
  analyzeTopicAccompaniment,
  buildTopicAccompanimentPromptBlock,
  detectTopicBuckets,
  extractStrongAstroTokens,
} from "../topic-accompaniment.js";

const WITH_THESIS = {
  usedSignals: ["Транзитный Юпитер △ натальное Солнце"],
};

const NO_THESIS = { usedSignals: [] as string[] };

describe("detectTopicBuckets", () => {
  it("detects money and work themes", () => {
    expect(detectTopicBuckets("А вдруг я останусь без денег?")).toContain("money");
    expect(detectTopicBuckets("А если меня никто не наймёт?")).toContain("work");
  });
});

describe("extractStrongAstroTokens", () => {
  it("detects planets and houses", () => {
    const tokens = extractStrongAstroTokens("Расскажи про Марс в 10 доме");
    expect(tokens).toContain("planet:mars");
    expect(tokens).toContain("house:10");
  });
});

describe("analyzeTopicAccompaniment", () => {
  it("stays fresh on the first user turn", () => {
    const a = analyzeTopicAccompaniment(["Боюсь остаться без денег"], WITH_THESIS);
    expect(a.mode).toBe("fresh");
    expect(a.isSameTopicThread).toBe(false);
  });

  it("detects ongoing when a new thematic bucket appears", () => {
    const a = analyzeTopicAccompaniment(
      [
        "Боюсь остаться без денег",
        "А вдруг я останусь без денег?",
        "А если меня никто не наймёт?",
      ],
      WITH_THESIS,
    );
    expect(a.isSameTopicThread).toBe(true);
    expect(a.mode).toBe("ongoing");
    expect(a.noNewStrongSignals).toBe(false);
    expect(a.centralThesisExists).toBe(true);
  });

  it("enters recheck only with usedSignals and no new strong signals", () => {
    const a = analyzeTopicAccompaniment(
      ["Боюсь остаться без денег", "А вдруг я останусь без денег?"],
      WITH_THESIS,
    );
    expect(a.isSameTopicThread).toBe(true);
    expect(a.centralThesisExists).toBe(true);
    expect(a.noNewStrongSignals).toBe(true);
    expect(a.mode).toBe("recheck");
  });

  it("stays ongoing without usedSignals even on same topic", () => {
    const a = analyzeTopicAccompaniment(
      ["Боюсь остаться без денег", "А вдруг я останусь без денег?"],
      NO_THESIS,
    );
    expect(a.isSameTopicThread).toBe(true);
    expect(a.centralThesisExists).toBe(false);
    expect(a.mode).toBe("ongoing");
  });

  it("implicit continuation: short doubt without bucket stays same thread", () => {
    const a = analyzeTopicAccompaniment(
      ["Боюсь остаться без денег", "А вдруг я ошибаюсь?"],
      WITH_THESIS,
    );
    expect(a.isSameTopicThread).toBe(true);
    expect(a.noNewStrongSignals).toBe(true);
    expect(a.mode).toBe("recheck");
  });

  it("new astro terms in current turn prevent recheck", () => {
    const a = analyzeTopicAccompaniment(
      [
        "Боюсь остаться без денег",
        "А вдруг я останусь без денег?",
        "А что скажешь про Сатурн в 2 доме?",
      ],
      WITH_THESIS,
    );
    expect(a.isSameTopicThread).toBe(true);
    expect(a.noNewStrongSignals).toBe(false);
    expect(a.mode).toBe("ongoing");
  });

  it("does not treat unrelated topics as one thread", () => {
    const a = analyzeTopicAccompaniment(
      ["Какой у меня асцендент?", "Когда лучше переехать в другой город?"],
      WITH_THESIS,
    );
    expect(a.isSameTopicThread).toBe(false);
    expect(a.mode).toBe("fresh");
  });
});

describe("buildTopicAccompanimentPromptBlock", () => {
  it("returns null for fresh conversations", () => {
    expect(
      buildTopicAccompanimentPromptBlock(
        analyzeTopicAccompaniment(["Первый вопрос про деньги"], WITH_THESIS),
      ),
    ).toBeNull();
  });

  it("includes recheck block only in recheck mode", () => {
    const recheck = buildTopicAccompanimentPromptBlock(
      analyzeTopicAccompaniment(
        ["Боюсь остаться без денег", "А вдруг я останусь без денег?"],
        WITH_THESIS,
      ),
    );
    expect(recheck).toContain("РЕЖИМ ПЕРЕПРОВЕРКИ");
    expect(recheck).not.toContain("СНАЧАЛА заново посмотри");

    const ongoing = buildTopicAccompanimentPromptBlock(
      analyzeTopicAccompaniment(
        [
          "Боюсь остаться без денег",
          "А вдруг я останусь без денег?",
          "А если меня никто не наймёт?",
        ],
        WITH_THESIS,
      ),
    );
    expect(ongoing).toContain("РЕЖИМ СОПРОВОЖДЕНИЯ ОДНОЙ ТЕМЫ");
    expect(ongoing).toContain("режим углубления");
    expect(ongoing).not.toContain("РЕЖИМ ПЕРЕПРОВЕРКИ");
  });
});
