import { describe, expect, it } from "vitest";

import { ghostedChats } from "./ghostedChats";
import { sampleDataset } from "../model/fixture";
import type { Chat, Dataset, Message, PeerId } from "../model/types";

const DAY_MS = 86_400_000;

function msg(chatId: PeerId, timestamp: number, seq: number): Message {
  return {
    id: `${chatId}:${seq}`,
    chatId,
    senderId: "user:1",
    direction: "sent",
    timestamp,
    text: "",
    charCount: 0,
    wordCount: 0,
    mediaType: "text",
    reactionCount: 0,
  };
}

function datasetOf(fetchedAt: number, messages: Message[]): Dataset {
  const chats: Record<PeerId, Chat> = {};
  for (const m of messages) {
    chats[m.chatId] ??= { id: m.chatId, type: "private", title: m.chatId };
  }
  const times = messages.map((m) => m.timestamp);
  return {
    self: { id: "user:1", displayName: "Me", isSelf: true },
    contacts: { "user:1": { id: "user:1", displayName: "Me", isSelf: true } },
    chats,
    messages: [...messages].sort((a, b) => a.timestamp - b.timestamp),
    meta: {
      fetchedAt,
      messageCount: messages.length,
      dateRange: { from: Math.min(...times), to: Math.max(...times) },
      timezone: "UTC",
      partial: false,
    },
  };
}

describe("ghostedChats.compute", () => {
  it("ranks the ghosted chat above the always-active one (fixture)", () => {
    const { chats } = ghostedChats.compute(sampleDataset);
    const sam = chats.find((c) => c.chatId === "user:101");
    const alex = chats.find((c) => c.chatId === "user:100");
    if (!sam || !alex) throw new Error("both chats should be present");
    expect(sam.daysSinceLast).toBeGreaterThan(alex.daysSinceLast);
  });

  it("derives daysSinceLast from fetchedAt", () => {
    const fetchedAt = Date.UTC(2025, 5, 20, 0, 0, 0);
    const lastTs = fetchedAt - 5 * DAY_MS;
    const { chats } = ghostedChats.compute(
      datasetOf(fetchedAt, [msg("c:1", lastTs, 0)]),
    );
    expect(chats[0].daysSinceLast).toBe(5);
  });

  it("captures the last message's direction", () => {
    const fetchedAt = Date.UTC(2025, 5, 20, 0, 0, 0);
    const older = msg("c:1", fetchedAt - 3 * DAY_MS, 0);
    const newest: Message = {
      ...msg("c:1", fetchedAt - 1 * DAY_MS, 1),
      direction: "received",
    };
    const { chats } = ghostedChats.compute(
      datasetOf(fetchedAt, [older, newest]),
    );
    expect(chats[0].lastDirection).toBe("received");
  });

  it("sorts descending and caps at 10", () => {
    const fetchedAt = Date.UTC(2025, 5, 20, 0, 0, 0);
    const messages = Array.from({ length: 12 }, (_, i) =>
      msg(`c:${i}`, fetchedAt - i * DAY_MS, 0),
    );
    const { chats } = ghostedChats.compute(datasetOf(fetchedAt, messages));
    expect(chats.length).toBe(10);
    for (let i = 1; i < chats.length; i++) {
      expect(chats[i - 1].daysSinceLast).toBeGreaterThanOrEqual(
        chats[i].daysSinceLast,
      );
    }
  });

  it("tolerates an empty dataset", () => {
    const empty: Dataset = {
      self: { id: "user:1", displayName: "Me", isSelf: true },
      contacts: {},
      chats: {},
      messages: [],
      meta: {
        fetchedAt: 0,
        messageCount: 0,
        dateRange: { from: 0, to: 0 },
        timezone: "UTC",
        partial: false,
      },
    };
    expect(ghostedChats.compute(empty).chats).toEqual([]);
  });
});
