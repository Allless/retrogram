import { describe, expect, it } from "vitest";

import { sessionThresholdMs, splitSessions } from "./sessions";

const S = 1000;
const M = 60 * S;
const H = 60 * M;

describe("sessionThresholdMs", () => {
  it("finds a boundary between conversation pauses and silences", () => {
    // Busy chat: typing bursts (excluded from the fit), ~3–9m
    // within-conversation pauses, and 8–16h between-conversation silences.
    const gaps = [
      ...Array.from({ length: 200 }, (_, i) => 5 * S + (i % 9) * S),
      ...Array.from({ length: 120 }, (_, i) => 3 * M + (i % 7) * M),
      ...Array.from({ length: 25 }, (_, i) => 8 * H + (i % 5) * 2 * H),
    ];
    const threshold = sessionThresholdMs(gaps);
    expect(threshold).toBeGreaterThanOrEqual(4 * H); // clamp floor
    expect(threshold).toBeLessThan(8 * H); // below the silence hump
  });

  it("falls back to 4h with too few gaps", () => {
    expect(sessionThresholdMs([30 * S, 45 * S, 5 * H])).toBe(4 * H);
  });

  it("falls back when the distribution is unimodal", () => {
    const uniform = Array.from({ length: 200 }, (_, i) => 60 * S + i * S);
    expect(sessionThresholdMs(uniform)).toBe(4 * H);
  });

  it("ignores burst gaps: a chat of bursts plus few silences falls back", () => {
    const gaps = [
      ...Array.from({ length: 100 }, () => 0),
      ...Array.from({ length: 10 }, (_, i) => 6 * H + i * M),
    ];
    expect(sessionThresholdMs(gaps)).toBe(4 * H);
  });
});

describe("splitSessions", () => {
  it("splits at gaps above the threshold and keeps order", () => {
    const items = [0, 1 * M, 2 * M, 5 * H, 5 * H + M].map((timestamp) => ({
      timestamp,
    }));
    const sessions = splitSessions(items, 1 * H);
    expect(sessions.map((s) => s.length)).toEqual([3, 2]);
  });

  it("handles empty input", () => {
    expect(splitSessions([], 1 * H)).toEqual([]);
  });
});
