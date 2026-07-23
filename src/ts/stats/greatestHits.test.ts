import { describe, expect, it } from "vitest";

import type { Dataset, Message } from "../model/types";
import { greatestHits } from "./greatestHits";

let seq = 0;
function msg(overrides: Partial<Message>): Message {
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
    reactionCount: 0,
    ...overrides,
  };
}

function datasetOf(messages: Message[]): Dataset {
  return {
    self: { id: "user:1", displayName: "Me", isSelf: true },
    contacts: {},
    chats: { c: { id: "c", type: "private", title: "Chat" } },
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

describe("greatestHits.compute", () => {
  it("ranks your most-reacted messages, top 3", () => {
    const { hits } = greatestHits.compute(
      datasetOf([
        msg({ id: "c:a", text: "meh", reactionCount: 1 }),
        msg({ id: "c:b", text: "good", reactionCount: 5 }),
        msg({ id: "c:c", text: "great", reactionCount: 9 }),
        msg({ id: "c:d", text: "ok", reactionCount: 2 }),
        msg({ id: "c:e", text: "silent" }),
      ]),
    );
    expect(hits.map((h) => h.messageId)).toEqual(["c:c", "c:b", "c:d"]);
    expect(hits[0].reactionCount).toBe(9);
    expect(hits[0].chatTitle).toBe("Chat");
  });

  it("ignores received messages and surfaces reaction emoji by count", () => {
    const { hits } = greatestHits.compute(
      datasetOf([
        msg({ id: "c:theirs", direction: "received", reactionCount: 50 }),
        msg({
          id: "c:mine",
          text: "banger",
          reactionCount: 3,
          reactions: [
            { emoticon: "👍", count: 1, you: false },
            { emoticon: "❤️", count: 2, you: false },
          ],
        }),
      ]),
    );
    expect(hits.map((h) => h.messageId)).toEqual(["c:mine"]);
    expect(hits[0].reactionEmoji).toEqual(["❤️", "👍"]);
  });

  it("returns empty when nothing you sent has reactions", () => {
    const { hits } = greatestHits.compute(datasetOf([msg({ text: "hi" })]));
    expect(hits).toEqual([]);
  });
});
