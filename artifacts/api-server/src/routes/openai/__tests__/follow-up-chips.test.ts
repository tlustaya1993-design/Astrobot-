import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  followUpChipsTestInternals,
  resetFollowUpChipCacheForTests,
  resolveFollowUpSource,
} from "../follow-up-chips.js";
import type {
  FollowUpChipDto,
  GenerateFollowUpChipsInput,
} from "../../../lib/follow-up-chips-llm.js";

describe("resolveFollowUpSource", () => {
  it("uses the latest stored assistant message and preceding stored user text", () => {
    const source = resolveFollowUpSource(
      [
        { id: 6, role: "assistant", content: " Stored assistant reply " },
        { id: 5, role: "user", content: " Stored user question " },
        { id: 4, role: "assistant", content: "Older assistant reply" },
      ],
      null,
    );

    expect(source).toEqual({
      messageId: 6,
      userText: "Stored user question",
      assistantText: "Stored assistant reply",
    });
  });

  it("rejects requests for anything other than the latest stored assistant message", () => {
    const source = resolveFollowUpSource(
      [
        { id: 6, role: "assistant", content: "Latest assistant reply" },
        { id: 5, role: "user", content: "Latest user question" },
        { id: 4, role: "assistant", content: "Older assistant reply" },
      ],
      4,
    );

    expect(source).toBeNull();
  });
});

describe("follow-up chip generation cache", () => {
  beforeEach(() => {
    resetFollowUpChipCacheForTests();
  });

  it("collapses concurrent and repeated requests for the same assistant message", async () => {
    const chips: FollowUpChipDto[] = [
      { label: "Как это повлияет на работу?", prompt: "Как это повлияет на работу?" },
    ];
    const generate = vi.fn(
      async (_input: GenerateFollowUpChipsInput): Promise<FollowUpChipDto[]> => chips,
    );
    const input: GenerateFollowUpChipsInput = {
      userText: "Что с карьерой?",
      assistantText: "Период помогает пересобрать карьерные цели.",
      contact: null,
      contactExtendedMode: false,
    };

    const [first, second] = await Promise.all([
      followUpChipsTestInternals.getCachedOrGenerateFollowUpChips(
        "session:conversation:message",
        input,
        generate,
      ),
      followUpChipsTestInternals.getCachedOrGenerateFollowUpChips(
        "session:conversation:message",
        input,
        generate,
      ),
    ]);
    const third = await followUpChipsTestInternals.getCachedOrGenerateFollowUpChips(
      "session:conversation:message",
      input,
      generate,
    );

    expect(first).toBe(chips);
    expect(second).toBe(chips);
    expect(third).toBe(chips);
    expect(generate).toHaveBeenCalledTimes(1);
  });
});
