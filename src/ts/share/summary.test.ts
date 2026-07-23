import { describe, expect, it } from "vitest";

import { sampleDataset } from "../model/fixture";
import { volumeOverTime } from "../stats/volumeOverTime";
import { buildSummary, isSharedSummary } from "./summary";

describe("buildSummary", () => {
  const summary = buildSummary(sampleDataset);
  const serialized = JSON.stringify(summary);

  it("carries the aggregate stats", () => {
    expect(summary.v).toBe(1);
    expect(summary.messageCount).toBe(sampleDataset.meta.messageCount);
    expect(summary.volume).toEqual(volumeOverTime.compute(sampleDataset));
    expect(summary.heatmap.slots).toHaveLength(168);
    expect(summary.streaks.longestStreakDays).toBeGreaterThan(0);
    expect(summary.topChatMessages).toBeGreaterThan(0);
  });

  it("leaks no identities: no chat titles, usernames, or ids", () => {
    for (const chat of Object.values(sampleDataset.chats)) {
      expect(serialized).not.toContain(chat.title);
    }
    for (const contact of Object.values(sampleDataset.contacts)) {
      // Skip self: "Me" is a substring of field names like "yourMedianSeconds".
      if (contact.isSelf) continue;
      expect(serialized).not.toContain(contact.displayName);
      if (contact.username) {
        expect(serialized).not.toContain(contact.username);
      }
    }
    expect(serialized).not.toContain("user:");
    expect(serialized).not.toContain("chat:");
  });

  it("leaks no message text", () => {
    for (const message of sampleDataset.messages) {
      if (message.text.length > 0) {
        expect(serialized).not.toContain(message.text);
      }
    }
  });

  it("validates through the guard, and rejects junk", () => {
    expect(isSharedSummary(summary)).toBe(true);
    expect(isSharedSummary(JSON.parse(serialized))).toBe(true);
    expect(isSharedSummary(null)).toBe(false);
    expect(isSharedSummary({})).toBe(false);
    expect(isSharedSummary({ v: 2, messageCount: 1 })).toBe(false);
  });
});
