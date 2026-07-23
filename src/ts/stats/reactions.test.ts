import { describe, expect, it } from "vitest";

import type { Dataset, Message, MessageReaction } from "../model/types";
import { reactions } from "./reactions";

let seq = 0;
function msg(reactionList?: MessageReaction[]): Message {
  const total = (reactionList ?? []).reduce((sum, r) => sum + r.count, 0);
  return {
    id: `c:${seq++}`,
    chatId: "c",
    senderId: "user:1",
    direction: "sent",
    timestamp: 0,
    text: "",
    charCount: 0,
    wordCount: 0,
    mediaType: "text",
    reactionCount: total,
    reactions: reactionList,
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

describe("reactions.compute", () => {
  it("splits your picks from everyone else's", () => {
    const result = reactions.compute(
      datasetOf([
        // ❤️ ×3: one is yours, two are theirs.
        msg([{ emoticon: "❤️", count: 3, you: true }]),
        // 👍 ×1 theirs only.
        msg([{ emoticon: "👍", count: 1, you: false }]),
        // 😂 yours only.
        msg([{ emoticon: "😂", count: 1, you: true }]),
      ]),
    );

    expect(result.given).toEqual([
      { emoji: "❤️", count: 1 },
      { emoji: "😂", count: 1 },
    ]);
    expect(result.received).toEqual([
      { emoji: "❤️", count: 2 },
      { emoji: "👍", count: 1 },
    ]);
  });

  it("aggregates the same emoji across messages, sorted by count", () => {
    const result = reactions.compute(
      datasetOf([
        msg([{ emoticon: "👍", count: 1, you: true }]),
        msg([{ emoticon: "👍", count: 1, you: true }]),
        msg([{ emoticon: "🔥", count: 1, you: true }]),
      ]),
    );
    expect(result.given).toEqual([
      { emoji: "👍", count: 2 },
      { emoji: "🔥", count: 1 },
    ]);
  });

  it("handles messages without reactions", () => {
    const result = reactions.compute(datasetOf([msg(), msg(undefined)]));
    expect(result.given).toEqual([]);
    expect(result.received).toEqual([]);
  });
});
