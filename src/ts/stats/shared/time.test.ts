import { describe, expect, it } from "vitest";

import type { Message } from "../../model/types";
import { bucketByDay, dayKey, hourOfWeek, monthKey, weekKey } from "./time";

// 2025-06-16 is a Monday. 08:30 UTC.
const MONDAY_0830_UTC = Date.UTC(2025, 5, 16, 8, 30, 0);

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

describe("time bucketing", () => {
  it("hourOfWeek uses Monday as slot 0 and reflects the timezone", () => {
    // Berlin is UTC+2 in June, so 08:30 UTC is 10:30 local → Monday, hour 10.
    expect(hourOfWeek(MONDAY_0830_UTC, "Europe/Berlin")).toBe(10);
    // In UTC the same instant is Monday hour 8.
    expect(hourOfWeek(MONDAY_0830_UTC, "UTC")).toBe(8);
  });

  it("hourOfWeek stays within 0–167", () => {
    for (let d = 0; d < 7; d++) {
      const ts = MONDAY_0830_UTC + d * 24 * 60 * 60 * 1000;
      const slot = hourOfWeek(ts, "UTC");
      expect(slot).toBeGreaterThanOrEqual(0);
      expect(slot).toBeLessThan(168);
    }
  });

  it("dayKey and monthKey format in the target timezone", () => {
    expect(dayKey(MONDAY_0830_UTC, "UTC")).toBe("2025-06-16");
    expect(monthKey(MONDAY_0830_UTC, "UTC")).toBe("2025-06");
  });

  it("weekKey anchors to that week's Monday", () => {
    const wednesday = MONDAY_0830_UTC + 2 * 24 * 60 * 60 * 1000;
    expect(weekKey(wednesday, "UTC")).toBe("2025-06-16");
  });

  it("bucketByDay groups messages by local day", () => {
    const sameDay = MONDAY_0830_UTC + 3 * 60 * 60 * 1000;
    const nextDay = MONDAY_0830_UTC + 24 * 60 * 60 * 1000;
    const buckets = bucketByDay(
      [msg(MONDAY_0830_UTC), msg(sameDay), msg(nextDay)],
      "UTC",
    );
    expect(buckets.get("2025-06-16")?.length).toBe(2);
    expect(buckets.get("2025-06-17")?.length).toBe(1);
  });
});
