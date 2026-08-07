import { describe, expect, it } from "vitest";

import { sampleDataset } from "../model/fixture";
import type { Dataset } from "../model/types";
import { volumeOverTime } from "../stats/volumeOverTime";
import {
  ALL_SHARE_SECTIONS,
  buildShare,
  isSharedSummary,
  SHARE_VERSION,
  shareStatus,
  stripThumbs,
} from "./summary";

describe("buildShare", () => {
  const { summary, thumbSources } = buildShare(sampleDataset);
  const serialized = JSON.stringify(summary);

  it("carries the aggregate stats", () => {
    expect(summary.v).toBe(SHARE_VERSION);
    expect(summary.messageCount).toBe(sampleDataset.meta.messageCount);
    expect(summary.volume).toEqual(volumeOverTime.compute(sampleDataset));
    expect(summary.heatmap?.slots).toHaveLength(168);
    expect(summary.streaks?.longestStreakDays).toBeGreaterThan(0);
    expect(summary.topChatMessages).toBeGreaterThan(0);
    expect(summary.hits?.length).toBeGreaterThan(0);
    expect(summary.stickerTotal).toBeGreaterThan(0);
  });

  it("leaks no private peer's identity, and never a peer id", () => {
    for (const chat of Object.values(sampleDataset.chats)) {
      // Peers with a public @username may appear by name — that handle is
      // public on Telegram. Everyone else must be relabelled.
      if (chat.username) continue;
      expect(serialized).not.toContain(chat.title);
    }
    for (const contact of Object.values(sampleDataset.contacts)) {
      // Skip self: "Me" is a substring of field names like "yourMedianSeconds".
      if (contact.isSelf || contact.username) continue;
      expect(serialized).not.toContain(contact.displayName);
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

/** Everything except the identities opt-in — the anonymizing default. */
const ANON_SECTIONS = ALL_SHARE_SECTIONS.filter((key) => key !== "identities");

describe("public peers in shares", () => {
  const publicDataset: Dataset = {
    ...sampleDataset,
    chats: {
      ...sampleDataset.chats,
      "chat:public": {
        id: "chat:public",
        type: "channel",
        title: "Public Channel",
        username: "publicchannel",
      },
      "user:public": {
        id: "user:public",
        type: "private",
        title: "Public Person",
        username: "publicperson",
      },
      "user:private": {
        id: "user:private",
        type: "private",
        title: "Private Person",
      },
    },
  };

  it("names publicly addressable peers and hides private ones", () => {
    const messages = [
      ...["chat:public", "user:public", "user:private"].flatMap((chatId, c) =>
        Array.from({ length: 8 }, (_, i) => ({
          ...sampleDataset.messages[0],
          id: `${chatId}:${i}`,
          chatId,
          direction: i % 2 === 0 ? ("sent" as const) : ("received" as const),
          timestamp: sampleDataset.meta.dateRange.from + (c * 40 + i) * 60_000,
        })),
      ),
    ];
    const build = (keys: readonly string[]) =>
      JSON.stringify(
        buildShare({ ...publicDataset, messages }, new Set(keys as never))
          .summary,
      );

    const anonymized = build(ANON_SECTIONS);
    expect(anonymized).toContain("Public Channel");
    expect(anonymized).toContain("Public Person");
    expect(anonymized).not.toContain("Private Person");

    // With the identities opt-in, private peers are named too.
    const named = build(ALL_SHARE_SECTIONS);
    expect(named).toContain("Private Person");

    const serialized = anonymized;
    // ids never travel, public or not
    expect(serialized).not.toContain("chat:public");
    expect(serialized).not.toContain("user:public");
  });
});

describe("anonymous labels", () => {
  it("numbers contacts and groups on separate counters", () => {
    const chats: Dataset["chats"] = {};
    const messages = [];
    for (const [i, type] of (
      ["private", "group", "private", "group"] as const
    ).entries()) {
      const chatId = `${type === "group" ? "chat" : "user"}:${i}`;
      chats[chatId] = { id: chatId, type, title: `Peer ${i}` };
      for (let m = 0; m < 8; m++) {
        messages.push({
          ...sampleDataset.messages[0],
          id: `${chatId}:${m}`,
          chatId,
          direction: m % 2 === 0 ? ("sent" as const) : ("received" as const),
          timestamp: sampleDataset.meta.dateRange.from + (i * 40 + m) * 60_000,
        });
      }
    }
    const { summary } = buildShare(
      { ...sampleDataset, chats, messages },
      new Set(ANON_SECTIONS),
    );
    const serialized = JSON.stringify(summary);
    expect(serialized).toContain("Contact 1");
    expect(serialized).toContain("Contact 2");
    expect(serialized).toContain("Group 1");
    expect(serialized).toContain("Group 2");
    // No shared sequence: labels never skip numbers.
    expect(serialized).not.toContain("Contact 3");
    expect(serialized).not.toContain("Group 3");
  });
});

describe("share version gating", () => {
  it("accepts the current payload", () => {
    const { summary } = buildShare(sampleDataset);
    expect(shareStatus(JSON.parse(JSON.stringify(summary)))).toBe("ok");
  });

  it("rejects an older payload as unsupported, not invalid", () => {
    const { summary } = buildShare(sampleDataset);
    const old = { ...JSON.parse(JSON.stringify(summary)), v: 1 };
    expect(shareStatus(old)).toBe("unsupported");
  });

  it("rejects junk as invalid", () => {
    expect(shareStatus({ hello: "world" })).toBe("invalid");
    expect(shareStatus(null)).toBe("invalid");
    // v matches but the payload is missing required fields
    expect(shareStatus({ v: SHARE_VERSION })).toBe("invalid");
  });

  it("always carries who shared it", () => {
    const { summary } = buildShare(sampleDataset);
    expect(summary.self.title).toBe(sampleDataset.self.displayName);
  });
});
