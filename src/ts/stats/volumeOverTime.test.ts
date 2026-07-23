import { describe, expect, it } from "vitest";

import { volumeOverTime } from "./volumeOverTime";
import { sampleDataset } from "../model/fixture";
import type { Dataset, Message } from "../model/types";

function emptyDataset(): Dataset {
  return {
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
}

function msg(timestamp: number, direction: Message["direction"]): Message {
  return {
    id: `c:${timestamp}`,
    chatId: "c",
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

describe("volumeOverTime.compute", () => {
  it("returns months sorted ascending by period", () => {
    const { monthly } = volumeOverTime.compute(sampleDataset);
    const periods = monthly.map((m) => m.period);
    expect([...periods].sort((a, b) => a.localeCompare(b))).toEqual(periods);
  });

  const privateCount = sampleDataset.messages.filter(
    (m) => sampleDataset.chats[m.chatId]?.type === "private",
  ).length;

  it("monthly totals sum to the private-chat message count", () => {
    const result = volumeOverTime.compute(sampleDataset);
    const monthlySum = result.monthly.reduce((s, m) => s + m.total, 0);
    expect(monthlySum).toBe(privateCount);
    expect(privateCount).toBeLessThan(sampleDataset.messages.length);
  });

  it("totalSent + totalReceived equals the private-chat message count", () => {
    const result = volumeOverTime.compute(sampleDataset);
    expect(result.totalSent + result.totalReceived).toBe(privateCount);
  });

  it("counts sent vs received correctly on a hand-built dataset", () => {
    const jan = Date.UTC(2025, 0, 10, 12);
    const feb = Date.UTC(2025, 1, 10, 12);
    const dataset = emptyDataset();
    dataset.messages = [
      msg(jan, "sent"),
      msg(jan + 1000, "received"),
      msg(feb, "sent"),
    ];
    const result = volumeOverTime.compute(dataset);
    expect(result.monthly).toEqual([
      { period: "2025-01", sent: 1, received: 1, total: 2 },
      { period: "2025-02", sent: 1, received: 0, total: 1 },
    ]);
    expect(result.totalSent).toBe(2);
    expect(result.totalReceived).toBe(1);
  });

  it("tolerates an empty dataset", () => {
    const result = volumeOverTime.compute(emptyDataset());
    expect(result.monthly).toEqual([]);
    expect(result.totalSent).toBe(0);
    expect(result.totalReceived).toBe(0);
  });
});
