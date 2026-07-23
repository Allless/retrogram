import { describe, expect, it } from "vitest";

import type { Dataset, Message } from "../model/types";
import { sampleDataset } from "../model/fixture";
import { emojiFrequency } from "./emojiFrequency";

function msg(text: string, direction: Message["direction"] = "sent"): Message {
  return {
    id: `c:${text}:${direction}`,
    chatId: "c",
    senderId: direction === "sent" ? "user:1" : "user:2",
    direction,
    timestamp: 0,
    text,
    charCount: text.length,
    wordCount: 0,
    mediaType: "text",
    reactionCount: 0,
  };
}

function datasetOf(messages: Message[]): Dataset {
  return {
    self: { id: "user:1", displayName: "Me", isSelf: true },
    contacts: {},
    chats: {},
    messages,
    meta: {
      fetchedAt: 0,
      messageCount: messages.length,
      dateRange: { from: 0, to: 0 },
      timezone: "UTC",
      partial: false,
    },
  };
}

describe("emojiFrequency.compute", () => {
  it("tallies emoji with count-desc, emoji-asc ordering", () => {
    const { topEmoji } = emojiFrequency.compute(
      datasetOf([msg("😀😀🎉"), msg("😀 hi"), msg("🎉")]),
    );
    expect(topEmoji).toEqual([
      { emoji: "😀", count: 3 },
      { emoji: "🎉", count: 2 },
    ]);
  });

  it("returns an empty list when there are no emoji", () => {
    const { topEmoji } = emojiFrequency.compute(datasetOf([msg("just words")]));
    expect(topEmoji).toEqual([]);
  });

  it("ignores emoji in received messages", () => {
    const { topEmoji } = emojiFrequency.compute(
      datasetOf([msg("🍓", "sent"), msg("📍🇬🇧⏰", "received")]),
    );
    expect(topEmoji).toEqual([{ emoji: "🍓", count: 1 }]);
  });

  it("finds emoji in the sample dataset, sorted descending", () => {
    const { topEmoji } = emojiFrequency.compute(sampleDataset);
    expect(topEmoji.length).toBeGreaterThan(0);
    for (let i = 1; i < topEmoji.length; i++) {
      expect(topEmoji[i - 1].count).toBeGreaterThanOrEqual(topEmoji[i].count);
    }
  });
});
