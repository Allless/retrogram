import { describe, expect, it } from "vitest";

import { sampleDataset } from "../model/fixture";
import { streaks } from "./streaks";
import type { Dataset, Message } from "../model/types";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
// Noon UTC on 2025-01-01, so day offsets map cleanly to UTC calendar days.
const BASE = Date.UTC(2025, 0, 1, 12, 0, 0);

function msg(dayOffset: number): Message {
  const timestamp = BASE + dayOffset * MS_PER_DAY;
  return {
    id: `c:${dayOffset}`,
    chatId: "c",
    senderId: "user:1",
    direction: "sent",
    timestamp,
    text: "hi",
    charCount: 2,
    wordCount: 1,
    mediaType: "text",
    reactionCount: 0,
  };
}

/** Dataset (tz UTC) with a message on each given day offset; fetchedAt on `fetchedAtDay`. */
function makeDataset(dayOffsets: number[], fetchedAtDay: number): Dataset {
  const messages = dayOffsets
    .map(msg)
    .sort((a, b) => a.timestamp - b.timestamp);
  return {
    self: { id: "user:1", displayName: "Me", isSelf: true },
    contacts: { "user:1": { id: "user:1", displayName: "Me", isSelf: true } },
    chats: { c: { id: "c", type: "private", title: "C" } },
    messages,
    meta: {
      fetchedAt: BASE + fetchedAtDay * MS_PER_DAY,
      messageCount: messages.length,
      dateRange: {
        from: messages[0]?.timestamp ?? BASE,
        to: messages[messages.length - 1]?.timestamp ?? BASE,
      },
      timezone: "UTC",
      partial: false,
    },
  };
}

describe("streaks.compute", () => {
  it("counts three consecutive days as a streak of 3", () => {
    const result = streaks.compute(makeDataset([0, 1, 2], 2));
    expect(result.longestStreakDays).toBe(3);
    expect(result.currentStreakDays).toBe(3);
    expect(result.activeDays).toBe(3);
    expect(result.totalSpanDays).toBe(3);
  });

  it("resets the longest streak across a gap", () => {
    // Days 0,1 then 3,4 — two runs of 2, gap at day 2.
    const result = streaks.compute(makeDataset([0, 1, 3, 4], 4));
    expect(result.longestStreakDays).toBe(2);
    expect(result.activeDays).toBe(4);
    expect(result.totalSpanDays).toBe(5); // inclusive span 0..4
  });

  it("reports current streak of 0 when the fetchedAt day is inactive", () => {
    // Active days 0,1; fetchedAt on day 3 (no activity that day).
    const result = streaks.compute(makeDataset([0, 1], 3));
    expect(result.currentStreakDays).toBe(0);
    expect(result.longestStreakDays).toBe(2);
  });

  it("measures the current streak backward from the fetchedAt day", () => {
    // Active days 5,6,7; fetchedAt on day 7.
    const result = streaks.compute(makeDataset([5, 6, 7], 7));
    expect(result.currentStreakDays).toBe(3);
  });

  it("counts duplicate-day messages as one active day", () => {
    const ds = makeDataset([0, 0, 0, 1], 1);
    const result = streaks.compute(ds);
    expect(result.activeDays).toBe(2);
    expect(result.longestStreakDays).toBe(2);
  });

  it("returns zeros and nulls for an empty dataset", () => {
    const result = streaks.compute(makeDataset([], 0));
    expect(result).toEqual({
      longestStreakDays: 0,
      currentStreakDays: 0,
      activeDays: 0,
      totalSpanDays: 0,
      firstMessageTimestamp: null,
      lastMessageTimestamp: null,
    });
  });

  it("produces sane values against the sample dataset", () => {
    const result = streaks.compute(sampleDataset);
    expect(result.longestStreakDays).toBeGreaterThanOrEqual(1);
    expect(result.activeDays).toBeGreaterThan(0);
    expect(result.activeDays).toBeLessThanOrEqual(result.totalSpanDays);
    expect(result.currentStreakDays).toBeGreaterThanOrEqual(0);
    expect(result.firstMessageTimestamp).not.toBeNull();
    expect(result.lastMessageTimestamp).not.toBeNull();
  });
});
