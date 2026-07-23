import { describe, expect, it } from "vitest";

import { responseTimes } from "./responseTimes";
import { sampleDataset } from "../model/fixture";
import type { Dataset, Message, MessageDirection } from "../model/types";

function msg(
  direction: MessageDirection,
  timestamp: number,
  index: number,
  chatId = "c",
): Message {
  return {
    id: `${chatId}:${index}`,
    chatId,
    senderId: direction === "sent" ? "user:1" : "user:2",
    direction,
    timestamp,
    text: "",
    charCount: 0,
    wordCount: 0,
    mediaType: "text",
    reactionCount: 0,
  };
}

function makeDataset(messages: Message[], fetchedAt = 0): Dataset {
  return {
    self: { id: "user:1", displayName: "Me", isSelf: true },
    contacts: {},
    chats: {
      c: { id: "c", type: "private", title: "C" },
      d: { id: "d", type: "private", title: "D" },
      g: { id: "g", type: "group", title: "G" },
    },
    messages,
    meta: {
      fetchedAt,
      messageCount: messages.length,
      dateRange: { from: 0, to: 0 },
      timezone: "UTC",
      partial: false,
    },
  };
}

const S = 1000; // ms per second

describe("responseTimes.compute", () => {
  it("computes exact medians from a known alternating sequence", () => {
    // your gaps: 120, 60, 180 → median 120
    // their gaps: 80, 240 → median 160
    const messages = [
      msg("received", 0, 0),
      msg("sent", 120 * S, 1), // your reply: 120s
      msg("received", 200 * S, 2), // their reply: 80s
      msg("sent", 260 * S, 3), // your reply: 60s
      msg("received", 500 * S, 4), // their reply: 240s
      msg("sent", 680 * S, 5), // your reply: 180s
    ];

    const result = responseTimes.compute(makeDataset(messages));

    expect(result.yourMedianSeconds).toBe(120);
    expect(result.theirMedianSeconds).toBe(160);
    expect(result.perChat).toHaveLength(1);
    expect(result.perChat[0]).toMatchObject({
      chatId: "c",
      title: "C",
      yourMedianSeconds: 120,
      replies: 3,
    });
  });

  it("excludes gaps longer than the 24h cap", () => {
    const messages = [
      msg("received", 0, 0),
      msg("sent", 25 * 60 * 60 * S, 1), // 25h later → not a reply
    ];

    const result = responseTimes.compute(makeDataset(messages));

    expect(result.yourMedianSeconds).toBeNull();
    expect(result.perChat).toHaveLength(0);
  });

  it("handles an empty dataset without throwing", () => {
    const result = responseTimes.compute(makeDataset([]));
    expect(result.yourMedianSeconds).toBeNull();
    expect(result.theirMedianSeconds).toBeNull();
    expect(result.perChat).toEqual([]);
    expect(result.theyGhost).toEqual([]);
    expect(result.youGhost).toEqual([]);
  });

  const H = 60 * 60 * S;

  /** Alternating chat: you reply after `yourGap` ms, they after `theirGap`. */
  function alternating(
    chatId: string,
    yourGap: number,
    theirGap: number,
    rounds = 3,
    lastFrom: MessageDirection = "sent",
  ): Message[] {
    const messages: Message[] = [];
    let t = 0;
    for (let i = 0; i < rounds; i++) {
      messages.push(msg("sent", t, messages.length, chatId));
      t += theirGap;
      messages.push(msg("received", t, messages.length, chatId));
      t += yourGap;
    }
    if (lastFrom === "sent") {
      messages.push(msg("sent", t, messages.length, chatId));
    }
    return messages;
  }

  it("ranks one-sided slowness as ghosting, not mutual slowness", () => {
    // "c": you answer in 60s, they answer in 48h → they ghost you.
    // "d": both answer in 48h → slow cadence, ghosting for neither side.
    const result = responseTimes.compute(
      makeDataset([
        ...alternating("c", 60 * S, 48 * H),
        ...alternating("d", 48 * H, 48 * H),
      ]),
    );

    expect(result.theyGhost.map((g) => g.chatId)).toEqual(["c"]);
    expect(result.youGhost).toEqual([]);

    const [c] = result.theyGhost;
    expect(Math.round(c.typicalReplySeconds)).toBe(48 * 60 * 60);
    expect(c.opportunities).toBe(3);
    const delta = Math.log2(49) - Math.log2(1 + 60 / 3600);
    expect(c.coefficient).toBeCloseTo(delta * Math.log2(7));
  });

  it("counts a run left unanswered for over a day against the silent side", () => {
    // They always answer in 1h; you answer in 60s but never answer their
    // final message. After 20 days of silence, that pending reply outweighs
    // your fast history — the chat flips from "they ghost" to "you ghost".
    const messages = [
      msg("received", 0, 0),
      ...alternating("c", 60 * S, 1 * H, 3, "received").map((m, i) => ({
        ...m,
        id: `c:${i + 1}`,
        timestamp: m.timestamp + 60 * S,
      })),
    ];
    const lastTimestamp = Math.max(...messages.map((m) => m.timestamp));

    const fresh = responseTimes.compute(
      makeDataset(messages, lastTimestamp + H),
    );
    expect(fresh.theyGhost.map((g) => g.chatId)).toEqual(["c"]);
    expect(fresh.youGhost).toEqual([]);

    const stale = responseTimes.compute(
      makeDataset(messages, lastTimestamp + 20 * 24 * H),
    );
    expect(stale.youGhost.map((g) => g.chatId)).toEqual(["c"]);
    expect(stale.theyGhost).toEqual([]);
  });

  it("excludes groups from ghost ranking", () => {
    const result = responseTimes.compute(
      makeDataset(alternating("g", 60 * S, 48 * H)),
    );
    expect(result.theyGhost).toEqual([]);
    expect(result.youGhost).toEqual([]);
  });

  it("needs at least 3 reply opportunities per side to qualify", () => {
    const messages = [
      msg("sent", 0, 0),
      msg("received", 100 * S, 1),
      msg("sent", 200 * S, 2),
      msg("received", 300 * S, 3),
    ];
    const result = responseTimes.compute(makeDataset(messages));
    expect(result.theyGhost).toEqual([]);
    expect(result.youGhost).toEqual([]);
  });

  it("runs on the sample fixture with sane, nonnegative medians", () => {
    const result = responseTimes.compute(sampleDataset);

    for (const median of [
      result.yourMedianSeconds,
      result.theirMedianSeconds,
    ]) {
      if (median !== null) expect(median).toBeGreaterThanOrEqual(0);
    }

    expect(result.perChat.length).toBeLessThanOrEqual(10);
    for (const chat of result.perChat) {
      expect(chat.replies).toBeGreaterThan(0);
      if (chat.yourMedianSeconds !== null) {
        expect(chat.yourMedianSeconds).toBeGreaterThanOrEqual(0);
      }
    }
  });
});
