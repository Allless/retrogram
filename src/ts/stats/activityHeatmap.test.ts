import { describe, expect, it } from "vitest";

import type { Dataset, Message } from "../model/types";
import { sampleDataset } from "../model/fixture";
import { activityHeatmap } from "./activityHeatmap";
import { hourOfWeek } from "./shared/time";

const { compute } = activityHeatmap;

function msg(timestamp: number): Message {
  return {
    id: `c:${timestamp}`,
    chatId: "c",
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

function datasetOf(messages: Message[], timezone = "UTC"): Dataset {
  return {
    self: { id: "user:1", displayName: "Me", isSelf: true },
    contacts: {},
    chats: {},
    messages,
    meta: {
      fetchedAt: 0,
      messageCount: messages.length,
      dateRange: { from: 0, to: 0 },
      timezone,
      partial: false,
    },
  };
}

// 2025-06-16 is a Monday; 08:00 UTC → slot 8.
const MONDAY_0800_UTC = Date.UTC(2025, 5, 16, 8, 0, 0);
// Wednesday same week, 09:00 UTC → slot 2*24 + 9 = 57.
const WEDNESDAY_0900_UTC =
  MONDAY_0800_UTC + 2 * 24 * 60 * 60 * 1000 + 60 * 60 * 1000;

describe("activityHeatmap.compute", () => {
  it("produces a 168-slot array whose sum equals the message count", () => {
    const result = compute(sampleDataset);
    expect(result.slots).toHaveLength(168);
    const total = result.slots.reduce((a, b) => a + b, 0);
    expect(total).toBe(sampleDataset.messages.length);
  });

  it("busiestSlot matches the maximum cell", () => {
    const result = compute(sampleDataset);
    const maxCount = Math.max(...result.slots);
    expect(result.busiestSlot.count).toBe(maxCount);
    const idx = result.busiestSlot.weekday * 24 + result.busiestSlot.hour;
    expect(result.slots[idx]).toBe(maxCount);
  });

  it("places messages in the expected slots for a known timezone", () => {
    const messages = [
      msg(MONDAY_0800_UTC),
      msg(MONDAY_0800_UTC),
      msg(WEDNESDAY_0900_UTC),
    ];
    const result = compute(datasetOf(messages));
    expect(result.slots[hourOfWeek(MONDAY_0800_UTC, "UTC")]).toBe(2);
    expect(result.slots[hourOfWeek(WEDNESDAY_0900_UTC, "UTC")]).toBe(1);
    expect(result.busiestSlot).toEqual({ weekday: 0, hour: 8, count: 2 });
    expect(result.peakHour).toBe(8);
    expect(result.peakWeekday).toBe(0);
  });

  it("handles an empty dataset with all zeros", () => {
    const result = compute(datasetOf([]));
    expect(result.slots).toHaveLength(168);
    expect(result.slots.every((c) => c === 0)).toBe(true);
    expect(result.busiestSlot).toEqual({ weekday: 0, hour: 0, count: 0 });
    expect(result.peakHour).toBe(0);
    expect(result.peakWeekday).toBe(0);
  });
});
