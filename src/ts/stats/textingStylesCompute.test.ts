import { describe, expect, it } from "vitest";

import { computeTextingStyles } from "./textingStylesCompute";
import type { Dataset, Message, MessageDirection } from "../model/types";

const S = 1000;
const H = 3600 * S;

function msg(
  direction: MessageDirection,
  timestamp: number,
  index: number,
  text = "hello there",
  chatId = "c",
): Message {
  return {
    id: `${chatId}:${index}`,
    chatId,
    senderId: direction === "sent" ? "user:1" : "user:2",
    direction,
    timestamp,
    text,
    charCount: text.length,
    wordCount: text.split(/\s+/).filter(Boolean).length,
    mediaType: "text",
    reactionCount: 0,
  };
}

function makeDataset(messages: Message[]): Dataset {
  return {
    self: { id: "user:1", displayName: "Me", isSelf: true },
    contacts: {},
    chats: {
      c: { id: "c", type: "private", title: "C" },
      g: { id: "g", type: "group", title: "G" },
      "user:1": { id: "user:1", type: "private", title: "Me" },
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

describe("computeTextingStyles", () => {
  it("counts turns as same-sender runs within a session", () => {
    // you: 1 msg; them: 3-msg burst; you: 2-msg burst → turns you=2, them=1
    const messages = [
      msg("sent", 0, 0),
      msg("received", 10 * S, 1),
      msg("received", 20 * S, 2),
      msg("received", 30 * S, 3),
      msg("sent", 40 * S, 4),
      msg("sent", 50 * S, 5),
    ];
    const r = computeTextingStyles(makeDataset(messages));
    expect(r.you).toMatchObject({ messages: 3, turns: 2 });
    expect(r.them).toMatchObject({ messages: 3, turns: 1 });
  });

  it("splits turns at session boundaries", () => {
    // Same sender before and after a 6h silence: two turns, not one.
    const messages = [msg("sent", 0, 0), msg("sent", 6 * H, 1)];
    const r = computeTextingStyles(makeDataset(messages));
    expect(r.you.turns).toBe(2);
  });

  it("aggregates words and chars per side", () => {
    const messages = [
      msg("sent", 0, 0, "one two three"),
      msg("received", 10 * S, 1, "four"),
    ];
    const r = computeTextingStyles(makeDataset(messages));
    expect(r.you.words).toBe(3);
    expect(r.you.chars).toBe("one two three".length);
    expect(r.them.words).toBe(1);
  });

  it("ignores groups and the self-chat", () => {
    const messages = [
      msg("sent", 0, 0, "x", "g"),
      msg("sent", 10 * S, 1, "x", "user:1"),
    ];
    const r = computeTextingStyles(makeDataset(messages));
    expect(r.you.messages).toBe(0);
    expect(r.splitters).toEqual([]);
  });

  it("ranks splitters only with enough turns", () => {
    // 12 alternating rounds → their turns = 12 ≥ 10 → eligible.
    const messages: Message[] = [];
    for (let i = 0; i < 12; i++) {
      messages.push(msg("sent", i * 60 * S, i * 2));
      messages.push(msg("received", i * 60 * S + 30 * S, i * 2 + 1));
    }
    const r = computeTextingStyles(makeDataset(messages));
    expect(r.splitters).toHaveLength(1);
    expect(r.splitters[0]).toMatchObject({ chatId: "c", turns: 12 });
  });
});
