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

const S = 1000;
const M = 60 * S;
const H = 60 * M;

describe("responseTimes.compute (session-based)", () => {
  it("computes exact medians from a known alternating sequence", () => {
    // One session (all gaps ≪ 1h fallback threshold).
    // your gaps: 120, 60, 180 → median 120; their gaps: 80, 240 → median 160
    const messages = [
      msg("received", 0, 0),
      msg("sent", 120 * S, 1),
      msg("received", 200 * S, 2),
      msg("sent", 260 * S, 3),
      msg("received", 500 * S, 4),
      msg("sent", 680 * S, 5),
    ];

    const result = responseTimes.compute(makeDataset(messages));

    expect(result.yourMedianSeconds).toBe(120);
    expect(result.theirMedianSeconds).toBe(160);
    expect(result.perChat).toHaveLength(1);
    expect(result.perChat[0]).toMatchObject({
      chatId: "c",
      title: "C",
      yourMedianSeconds: 120,
      theirMedianSeconds: 160,
      yourReplies: 3,
      theirReplies: 2,
      replies: 5,
    });
  });

  it("does not count a cross-session answer as a reply", () => {
    // Their message, then yours 25h later: two sessions, no within-session
    // sender switch — no reply times at all.
    const messages = [msg("received", 0, 0), msg("sent", 25 * H, 1)];

    const result = responseTimes.compute(makeDataset(messages, 26 * H));

    expect(result.yourMedianSeconds).toBeNull();
    expect(result.theirMedianSeconds).toBeNull();
    expect(result.perChat).toHaveLength(0);
    // …and their attempt was answered by you opening the next session, so
    // nobody is ghosting anybody.
    expect(result.youGhost).toEqual([]);
    expect(result.theyGhost).toEqual([]);
  });

  it("counts session openers as initiations", () => {
    // Three sessions: you open two, they open one.
    const messages = [
      msg("sent", 0, 0),
      msg("received", 1 * M, 1),
      msg("received", 5 * H, 2),
      msg("sent", 5 * H + M, 3),
      msg("sent", 10 * H, 4),
      msg("received", 10 * H + M, 5),
      // pad to reach the initiation minimum with a second chat
      msg("sent", 0, 6, "d"),
      msg("received", 6 * H, 7, "d"),
    ];

    const result = responseTimes.compute(makeDataset(messages, 11 * H));
    expect(result.initiations).toEqual({ yours: 3, theirs: 2 });
  });

  it("hides initiations below the minimum sample", () => {
    const result = responseTimes.compute(
      makeDataset([msg("sent", 0, 0), msg("received", 1 * M, 1)], 2 * H),
    );
    expect(result.initiations).toBeNull();
  });

  it("flags repeatedly ignored attempts as ghosting", () => {
    // They write to you in three separate sessions and you never say a word
    // in between — the strictest form of ghosting. (Had you opened any of
    // the following sessions yourself, that would count as re-engagement.)
    const messages = [
      msg("received", 0, 0),
      msg("received", 6 * H, 1),
      msg("received", 12 * H, 2), // final session, silence 22h > threshold
    ];
    const result = responseTimes.compute(makeDataset(messages, 34 * H));

    expect(result.youGhost).toHaveLength(1);
    expect(result.youGhost[0]).toMatchObject({
      chatId: "c",
      ignoredAttempts: 3,
      attempts: 3, // they opened all three sessions
    });
    expect(result.theyGhost).toEqual([]);
  });

  it("treats the silent side starting a later conversation as re-engagement", () => {
    // They attempt, you never reply in-session but open the next session
    // each time: left-on-read, not fully ghosted — stays out of the lists.
    const messages = [
      msg("received", 0, 0),
      msg("sent", 6 * H, 1),
      msg("received", 12 * H, 2),
      msg("sent", 18 * H, 3),
    ];
    const result = responseTimes.compute(makeDataset(messages, 30 * H));
    expect(result.youGhost).toEqual([]);
    expect(result.theyGhost).toEqual([]);
  });

  it("keeps a single ignored attempt out of the lists (dead zone)", () => {
    const messages = [
      msg("received", 0, 0),
      msg("sent", 6 * H, 1),
      msg("received", 12 * H, 2),
      msg("sent", 12 * H + M, 3), // engaged this time
    ];
    const result = responseTimes.compute(makeDataset(messages, 13 * H));
    expect(result.youGhost).toEqual([]);
  });

  it("does not count a fresh final message as ignored", () => {
    const messages = [
      msg("received", 0, 0),
      msg("sent", 6 * H, 1),
      msg("received", 12 * H, 2), // their attempt…
    ];
    // …but the export was made minutes later: still pending.
    const result = responseTimes.compute(makeDataset(messages, 12 * H + 5 * M));
    expect(result.youGhost).toEqual([]);
  });

  it("excludes the chat with yourself (Saved Messages) entirely", () => {
    // Chat id equal to self id: all messages "sent", would otherwise read
    // as you ghosting yourself and inflate initiations.
    const selfChat = "user:1";
    const messages = [
      msg("sent", 0, 0, selfChat),
      msg("sent", 6 * H, 1, selfChat),
      msg("sent", 12 * H, 2, selfChat),
    ];
    const dataset = makeDataset(messages, 24 * H);
    dataset.chats[selfChat] = { id: selfChat, type: "private", title: "Me" };
    const result = responseTimes.compute(dataset);
    expect(result.initiations).toBeNull();
    expect(result.theyGhost).toEqual([]);
    expect(result.youGhost).toEqual([]);
    expect(result.perChat).toEqual([]);
  });

  it("excludes groups from initiations and ghosting", () => {
    const messages = [
      msg("sent", 0, 0, "g"),
      msg("sent", 6 * H, 1, "g"),
      msg("sent", 12 * H, 2, "g"),
    ];
    const result = responseTimes.compute(makeDataset(messages, 24 * H));
    expect(result.initiations).toBeNull();
    expect(result.theyGhost).toEqual([]);
    expect(result.youGhost).toEqual([]);
  });

  it("handles an empty dataset without throwing", () => {
    const result = responseTimes.compute(makeDataset([]));
    expect(result.yourMedianSeconds).toBeNull();
    expect(result.theirMedianSeconds).toBeNull();
    expect(result.initiations).toBeNull();
    expect(result.perChat).toEqual([]);
    expect(result.theyGhost).toEqual([]);
    expect(result.youGhost).toEqual([]);
  });

  it("runs on the sample fixture with sane results", () => {
    const result = responseTimes.compute(sampleDataset);

    for (const value of [result.yourMedianSeconds, result.theirMedianSeconds]) {
      if (value !== null) expect(value).toBeGreaterThanOrEqual(0);
    }
    if (result.initiations) {
      expect(result.initiations.yours).toBeGreaterThanOrEqual(0);
      expect(result.initiations.theirs).toBeGreaterThanOrEqual(0);
    }
    expect(result.perChat.length).toBeLessThanOrEqual(6);
    for (const rank of [...result.theyGhost, ...result.youGhost]) {
      expect(rank.ignoredAttempts).toBeGreaterThanOrEqual(2);
    }
  });
});
