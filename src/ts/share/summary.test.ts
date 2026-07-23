import { describe, expect, it } from "vitest";

import { sampleDataset } from "../model/fixture";
import { volumeOverTime } from "../stats/volumeOverTime";
import { buildShare, isSharedSummary, stripThumbs } from "./summary";

describe("buildShare", () => {
  const { summary, thumbSources } = buildShare(sampleDataset);
  const serialized = JSON.stringify(summary);

  it("carries the aggregate stats", () => {
    expect(summary.v).toBe(1);
    expect(summary.messageCount).toBe(sampleDataset.meta.messageCount);
    expect(summary.volume).toEqual(volumeOverTime.compute(sampleDataset));
    expect(summary.heatmap?.slots).toHaveLength(168);
    expect(summary.streaks?.longestStreakDays).toBeGreaterThan(0);
    expect(summary.topChatMessages).toBeGreaterThan(0);
    expect(summary.hits?.length).toBeGreaterThan(0);
    expect(summary.stickerTotal).toBeGreaterThan(0);
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

  it("leaks no message text without the hitText opt-in", () => {
    for (const message of sampleDataset.messages) {
      if (message.text.length > 0) {
        expect(serialized).not.toContain(message.text);
      }
    }
  });

  it("includes hit text only with the opt-in", () => {
    const withText = buildShare(
      sampleDataset,
      new Set(["hits", "hitContent"]),
    ).summary;
    const textHit = withText.hits?.find((h) => h.text);
    expect(textHit).toBeDefined();
    // The id-bearing lookup keys stay outside the payload.
    expect(JSON.stringify(withText)).not.toContain("user:");
  });

  it("keeps thumbnail lookup keys out of the payload but aligned", () => {
    expect(thumbSources.hits.length).toBe(summary.hits?.length);
    expect(thumbSources.stickers.length).toBe(summary.stickerTop?.length);
    for (const source of thumbSources.stickers) {
      expect(serialized).not.toContain(source.mediaId);
      if (source.viaMessageId) {
        expect(serialized).not.toContain(source.viaMessageId);
      }
    }
  });

  it("includes only the selected sections", () => {
    const partial = buildShare(
      sampleDataset,
      new Set(["volume", "emoji"]),
    ).summary;
    expect(partial.volume).toBeDefined();
    expect(partial.topEmoji).toBeDefined();
    expect(partial.heatmap).toBeUndefined();
    expect(partial.streaks).toBeUndefined();
    expect(partial.hits).toBeUndefined();
    expect(partial.stickerTotal).toBeUndefined();
    expect(partial.topChatMessages).toBeUndefined();
    expect(partial.yourMedianSeconds).toBeUndefined();
    expect(partial.reactionsGiven).toBeUndefined();
    expect(isSharedSummary(JSON.parse(JSON.stringify(partial)))).toBe(true);
  });

  it("stripThumbs removes embedded thumbnails everywhere", () => {
    const withThumbs = buildShare(sampleDataset).summary;
    withThumbs.hits?.forEach((h) => (h.thumb = "data:image/jpeg;base64,x"));
    withThumbs.stickerTop?.forEach(
      (t) => (t.thumb = "data:image/jpeg;base64,x"),
    );
    const stripped = stripThumbs(withThumbs);
    expect(JSON.stringify(stripped)).not.toContain("data:image");
    expect(stripped.hits?.length).toBe(withThumbs.hits?.length);
    expect(stripped.stickerTop?.[0]?.count).toBe(
      withThumbs.stickerTop?.[0]?.count,
    );
  });

  it("validates through the guard, and rejects junk", () => {
    expect(isSharedSummary(summary)).toBe(true);
    expect(isSharedSummary(JSON.parse(serialized))).toBe(true);
    expect(isSharedSummary(null)).toBe(false);
    expect(isSharedSummary({})).toBe(false);
    expect(isSharedSummary({ v: 2, messageCount: 1 })).toBe(false);
  });
});
