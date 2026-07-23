import { describe, expect, it } from "vitest";

import type { Dataset, Message } from "../model/types";
import { sampleDataset } from "../model/fixture";
import { topDms, topGroups } from "./topContacts";

function msg(
  chatId: string,
  direction: Message["direction"],
  words: number,
): Message {
  return {
    id: `${chatId}:${Math.random()}`,
    chatId,
    senderId: direction === "sent" ? "user:1" : chatId,
    direction,
    timestamp: 0,
    text: "",
    charCount: 0,
    wordCount: words,
    mediaType: "text",
    reactionCount: 0,
  };
}

function makeDataset(messages: Message[]): Dataset {
  return {
    self: { id: "user:1", displayName: "Me", isSelf: true },
    contacts: {},
    chats: {
      "c:1": { id: "c:1", type: "private", title: "Chat One" },
      "c:2": { id: "c:2", type: "private", title: "Chat Two" },
      "g:1": { id: "g:1", type: "group", title: "Group One" },
      "ch:1": { id: "ch:1", type: "channel", title: "Channel One" },
    },
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

describe("topDms.compute", () => {
  it("returns [] for an empty dataset", () => {
    expect(topDms.compute(makeDataset([])).chats).toEqual([]);
  });

  it("sorts chats descending by message count", () => {
    const { chats } = topDms.compute(sampleDataset);
    for (let i = 1; i < chats.length; i++) {
      expect(chats[i - 1].messages).toBeGreaterThanOrEqual(chats[i].messages);
    }
  });

  it("caps the list at 10", () => {
    expect(topDms.compute(sampleDataset).chats.length).toBeLessThanOrEqual(10);
  });

  it("only includes private chats", () => {
    for (const chat of topDms.compute(sampleDataset).chats) {
      expect(sampleDataset.chats[chat.chatId].type).toBe("private");
    }
  });

  it("splits sent + received to equal total messages per chat", () => {
    for (const chat of topDms.compute(sampleDataset).chats) {
      expect(chat.sent + chat.received).toBe(chat.messages);
    }
  });

  it("resolves titles from dataset.chats and sums words", () => {
    const { chats } = topDms.compute(
      makeDataset([
        msg("c:1", "sent", 3),
        msg("c:1", "received", 2),
        msg("c:2", "sent", 5),
        msg("g:1", "sent", 7),
      ]),
    );
    expect(chats).toHaveLength(2);
    expect(chats[0]).toMatchObject({
      chatId: "c:1",
      title: "Chat One",
      messages: 2,
      words: 5,
      sent: 1,
      received: 1,
    });
    expect(chats[1]).toMatchObject({
      title: "Chat Two",
      messages: 1,
      words: 5,
    });
  });

  it("falls back to chatId when the chat is unknown", () => {
    const { chats } = topDms.compute(
      makeDataset([msg("c:unknown", "sent", 1)]),
    );
    expect(chats[0].title).toBe("c:unknown");
  });
});

describe("topGroups.compute", () => {
  it("only includes groups and channels, ranked by own messages", () => {
    const { chats } = topGroups.compute(
      makeDataset([
        msg("c:1", "sent", 1),
        msg("g:1", "sent", 1),
        msg("g:1", "sent", 1),
        msg("ch:1", "sent", 1),
      ]),
    );
    expect(chats.map((c) => c.chatId)).toEqual(["g:1", "ch:1"]);
    expect(chats[0].sent).toBe(2);
  });

  it("drops groups where you never posted", () => {
    const { chats } = topGroups.compute(
      makeDataset([msg("g:1", "received", 1)]),
    );
    expect(chats).toEqual([]);
  });

  it("sorts descending by sent count on the fixture", () => {
    const { chats } = topGroups.compute(sampleDataset);
    for (let i = 1; i < chats.length; i++) {
      expect(chats[i - 1].sent).toBeGreaterThanOrEqual(chats[i].sent);
    }
    for (const chat of chats) {
      expect(["group", "channel"]).toContain(
        sampleDataset.chats[chat.chatId].type,
      );
    }
  });
});
