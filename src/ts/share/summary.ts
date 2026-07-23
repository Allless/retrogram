/**
 * The anonymized share payload. Built ONLY from aggregate stat results that
 * carry no identities — no chat titles, no usernames, no message text, no
 * avatars. Anything per-chat (top DMs, ghost lists, greatest-hit snippets) is
 * reduced to bare numbers before it gets here, and the sharer picks which
 * sections are included at all. `summary.test.ts` asserts the serialized
 * payload leaks none of the fixture's names.
 */

import { activityHeatmap } from "../stats/activityHeatmap";
import { emojiFrequency } from "../stats/emojiFrequency";
import { greatestHits } from "../stats/greatestHits";
import { reactions } from "../stats/reactions";
import { responseTimes } from "../stats/responseTimes";
import { streaks } from "../stats/streaks";
import { topDms } from "../stats/topContacts";
import { topMediaByType } from "../stats/topMedia";
import { volumeOverTime } from "../stats/volumeOverTime";

import type { ActivityHeatmapResult } from "../stats/activityHeatmap";
import type { EmojiCount } from "../stats/emojiFrequency";
import type { ReactionCount } from "../stats/reactions";
import type { StreaksResult } from "../stats/streaks";
import type { VolumeOverTimeResult } from "../stats/volumeOverTime";
import type { Dataset, MediaType } from "../model/types";

/** The shareable sections, in display order. The sharer picks a subset. */
export const SHARE_SECTIONS = [
  { key: "headline", label: "Headline numbers" },
  { key: "volume", label: "Message volume" },
  { key: "heatmap", label: "Activity heatmap" },
  { key: "response", label: "Response medians" },
  { key: "emoji", label: "Most-used emoji" },
  { key: "reactions", label: "Reactions" },
  { key: "streaks", label: "Streaks" },
  { key: "hits", label: "Greatest hits" },
  { key: "media", label: "Top stickers & GIFs" },
] as const;

/**
 * Off-by-default opt-ins that reveal personal content (Greatest hits only —
 * sticker/GIF thumbnails are public catalog items and always embed).
 */
export const SHARE_EXTRAS = [
  { key: "hitText", label: "Include my message text (Greatest hits)" },
  { key: "thumbs", label: "Include my photo/video thumbnails (Greatest hits)" },
] as const;

export type ShareSection =
  (typeof SHARE_SECTIONS)[number]["key"] | (typeof SHARE_EXTRAS)[number]["key"];

/** One anonymized greatest hit: numbers, emoji, and (opt-in) text or thumb. */
export interface SharedHit {
  reactionCount: number;
  reactionEmoji: string[];
  mediaType: MediaType;
  text?: string; // only with the "hitText" opt-in
  thumb?: string; // data URI, only with the "thumbs" opt-in
}

export interface SharedTopMedia {
  count: number;
  thumb?: string; // data URI, only with the "thumbs" opt-in
}

export interface SharedSummary {
  v: 1;
  messageCount: number;
  from: number; // epoch ms
  to: number; // epoch ms
  timezone: string;
  // Sections below are present only when the sharer selected them.
  volume?: VolumeOverTimeResult;
  heatmap?: ActivityHeatmapResult;
  yourMedianSeconds?: number | null;
  theirMedianSeconds?: number | null;
  topEmoji?: EmojiCount[];
  reactionsGiven?: ReactionCount[];
  reactionsReceived?: ReactionCount[];
  streaks?: StreaksResult;
  hits?: SharedHit[];
  stickerTotal?: number;
  stickerTop?: SharedTopMedia[];
  gifTotal?: number;
  gifTop?: SharedTopMedia[];
  /** Headline: message count of the busiest DM — count only, never the name. */
  topChatMessages?: number;
  /** Headline: reactions on the single most-reacted message, and its emoji. */
  topHitReactions?: number;
  topHitEmoji?: string[];
  /** Headline copy of the longest streak, so it works without `streaks`. */
  longestStreakDays?: number;
}

/** A media document plus a message carrying it, for on-demand ref recovery. */
export interface MediaSource {
  mediaId: string;
  viaMessageId?: string;
}

/**
 * Blob-lookup keys for the thumbnail opt-in, aligned index-for-index with the
 * summary's `hits` / `stickerTop` / `gifTop` arrays. Kept OUTSIDE the payload:
 * message ids embed peer ids, so they must never be serialized into a share.
 */
export interface ThumbSources {
  hits: (string | null)[];
  stickers: MediaSource[];
  gifs: MediaSource[];
}

export interface ShareBuild {
  summary: SharedSummary;
  thumbSources: ThumbSources;
}

const HIT_TEXT_LIMIT = 100;
const TOP_MEDIA_LIMIT = 5;

const ALL_SECTIONS: ReadonlySet<ShareSection> = new Set(
  SHARE_SECTIONS.map((s) => s.key),
);

export function buildShare(
  dataset: Dataset,
  sections: ReadonlySet<ShareSection> = ALL_SECTIONS,
): ShareBuild {
  const thumbSources: ThumbSources = { hits: [], stickers: [], gifs: [] };
  const summary: SharedSummary = {
    v: 1,
    messageCount: dataset.meta.messageCount,
    from: dataset.meta.dateRange.from,
    to: dataset.meta.dateRange.to,
    timezone: dataset.meta.timezone,
  };

  if (sections.has("headline")) {
    const hit = greatestHits.compute(dataset).hits[0];
    summary.topChatMessages = topDms.compute(dataset).chats[0]?.messages ?? 0;
    summary.topHitReactions = hit?.reactionCount ?? 0;
    summary.topHitEmoji = hit?.reactionEmoji ?? [];
    summary.longestStreakDays = streaks.compute(dataset).longestStreakDays;
  }
  if (sections.has("volume")) {
    summary.volume = volumeOverTime.compute(dataset);
  }
  if (sections.has("heatmap")) {
    summary.heatmap = activityHeatmap.compute(dataset);
  }
  if (sections.has("response")) {
    const response = responseTimes.compute(dataset);
    summary.yourMedianSeconds = response.yourMedianSeconds;
    summary.theirMedianSeconds = response.theirMedianSeconds;
  }
  if (sections.has("emoji")) {
    summary.topEmoji = emojiFrequency.compute(dataset).topEmoji;
  }
  if (sections.has("reactions")) {
    const computed = reactions.compute(dataset);
    summary.reactionsGiven = computed.given;
    summary.reactionsReceived = computed.received;
  }
  if (sections.has("streaks")) {
    summary.streaks = streaks.compute(dataset);
  }
  if (sections.has("hits")) {
    const hits = greatestHits.compute(dataset).hits;
    summary.hits = hits.map((hit) => {
      const shared: SharedHit = {
        reactionCount: hit.reactionCount,
        reactionEmoji: hit.reactionEmoji,
        mediaType: hit.mediaType,
      };
      if (sections.has("hitText") && hit.text) {
        shared.text =
          hit.text.length > HIT_TEXT_LIMIT
            ? `${hit.text.slice(0, HIT_TEXT_LIMIT)}…`
            : hit.text;
      }
      return shared;
    });
    thumbSources.hits = hits.map((hit) =>
      hit.mediaType !== "text" ? hit.messageId : null,
    );
  }
  if (sections.has("media")) {
    const sentOf = (type: MediaType) =>
      dataset.messages.filter(
        (m) => m.direction === "sent" && m.mediaType === type,
      ).length;
    // A message carrying each document, so downloads can recover fresh refs.
    const messageByMedia = new Map<string, string>();
    for (const message of dataset.messages) {
      if (message.mediaId && !messageByMedia.has(message.mediaId)) {
        messageByMedia.set(message.mediaId, message.id);
      }
    }
    const sourceOf = (t: { mediaId: string }): MediaSource => ({
      mediaId: t.mediaId,
      viaMessageId: messageByMedia.get(t.mediaId),
    });
    const topStickers = topMediaByType(dataset, "sticker", TOP_MEDIA_LIMIT);
    const topGifs = topMediaByType(dataset, "gif", TOP_MEDIA_LIMIT);
    summary.stickerTotal = sentOf("sticker");
    summary.stickerTop = topStickers.map((t) => ({ count: t.count }));
    summary.gifTotal = sentOf("gif");
    summary.gifTop = topGifs.map((t) => ({ count: t.count }));
    thumbSources.stickers = topStickers.map(sourceOf);
    thumbSources.gifs = topGifs.map(sourceOf);
  }

  return { summary, thumbSources };
}

/** Drop embedded thumbnails — the inline URL fallback can't afford them. */
export function stripThumbs(summary: SharedSummary): SharedSummary {
  const withoutThumb = <T extends { thumb?: string }>(items?: T[]) =>
    items?.map((item) => {
      const rest = { ...item };
      delete rest.thumb;
      return rest;
    });
  return {
    ...summary,
    ...(summary.hits ? { hits: withoutThumb(summary.hits) } : {}),
    ...(summary.stickerTop
      ? { stickerTop: withoutThumb(summary.stickerTop) }
      : {}),
    ...(summary.gifTop ? { gifTop: withoutThumb(summary.gifTop) } : {}),
  };
}

/** Structural guard for payloads that arrive from a link. */
export function isSharedSummary(value: unknown): value is SharedSummary {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  if (
    record.v !== 1 ||
    typeof record.messageCount !== "number" ||
    typeof record.timezone !== "string"
  ) {
    return false;
  }
  const objectWhenPresent = (key: string) =>
    record[key] === undefined ||
    (typeof record[key] === "object" && record[key] !== null);
  return (
    objectWhenPresent("volume") &&
    objectWhenPresent("heatmap") &&
    objectWhenPresent("streaks") &&
    (record.topEmoji === undefined || Array.isArray(record.topEmoji))
  );
}
