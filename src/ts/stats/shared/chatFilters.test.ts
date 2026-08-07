import { describe, expect, it } from "vitest";

import { isNoiseChat } from "./chatFilters";
import type { Chat, Dataset } from "../../model/types";

function datasetWith(chats: Chat[]): Dataset {
  return {
    self: { id: "user:1", displayName: "Me", isSelf: true },
    contacts: {},
    chats: Object.fromEntries(chats.map((c) => [c.id, c])),
    messages: [],
    meta: {
      fetchedAt: 0,
      messageCount: 0,
      dateRange: { from: 0, to: 0 },
      timezone: "UTC",
      partial: false,
    },
  };
}

const chat = (id: string, extra: Partial<Chat> = {}): Chat => ({
  id,
  type: "private",
  title: id,
  ...extra,
});

describe("isNoiseChat", () => {
  it("excludes the chat with yourself", () => {
    const ds = datasetWith([chat("user:1")]);
    expect(isNoiseChat(ds, "user:1")).toBe(true);
  });

  it("excludes Telegram service peers", () => {
    const ds = datasetWith([
      chat("user:777000"),
      chat("user:1271266957"),
      chat("user:489000"),
    ]);
    for (const id of ["user:777000", "user:1271266957", "user:489000"]) {
      expect(isNoiseChat(ds, id)).toBe(true);
    }
  });

  it("excludes bots flagged at ingestion", () => {
    const ds = datasetWith([chat("user:5", { isBot: true })]);
    expect(isNoiseChat(ds, "user:5")).toBe(true);
  });

  it("excludes bots by username suffix (cached datasets without isBot)", () => {
    const ds = datasetWith([
      chat("user:6", { username: "anilibria_bot" }),
      chat("user:7", { username: "IDBankConcierge_bot" }),
      chat("user:8", { username: "BotanistAnna" }), // not a bot
    ]);
    expect(isNoiseChat(ds, "user:6")).toBe(true);
    expect(isNoiseChat(ds, "user:7")).toBe(true);
    expect(isNoiseChat(ds, "user:8")).toBe(false);
  });

  it("does not exclude a group whose title ends in bot", () => {
    const ds = datasetWith([
      chat("chat:9", { type: "group", username: "robot" }),
    ]);
    expect(isNoiseChat(ds, "chat:9")).toBe(false);
  });

  it("keeps ordinary human chats", () => {
    const ds = datasetWith([chat("user:10", { username: "alice" })]);
    expect(isNoiseChat(ds, "user:10")).toBe(false);
  });
});
