/**
 * The share payload. Built ONLY from aggregate stat results: no message text
 * (without the explicit opt-in), no avatars, no peer ids. Per-chat rows are
 * relabelled "Contact N" / "Group N" — except peers with a public @username,
 * which stay named because they are publicly addressable on Telegram anyway.
 * The sharer picks which sections are included at all. `summary.test.ts`
 * asserts the payload leaks no private peer's identity.
 */

import { debug } from "../debug";
import { activityHeatmap } from "../stats/activityHeatmap";
import { emojiFrequency } from "../stats/emojiFrequency";
import { greatestHits } from "../stats/greatestHits";
import { reactions } from "../stats/reactions";
import { responseTimes } from "../stats/responseTimes";
import { streaks } from "../stats/streaks";
import { computeResponseTimes } from "../stats/responseTimesCompute";
import { computeTextingStyles } from "../stats/textingStylesCompute";
import { ghostedChats } from "../stats/ghostedChats";
import { nightOwls } from "../stats/nightOwls";
import { topDms, topGroups } from "../stats/topContacts";
import { trophyShelf } from "../stats/trophyShelf";
import { topMediaByType } from "../stats/topMedia";
import { volumeOverTime } from "../stats/volumeOverTime";

import type { ActivityHeatmapResult } from "../stats/activityHeatmap";
import type { EmojiCount } from "../stats/emojiFrequency";
import type { ReactionCount } from "../stats/reactions";
import type { StreaksResult } from "../stats/streaks";
import type { GhostedChatsResult } from "../stats/ghostedChats";
import type { NightOwlsResult } from "../stats/nightOwls";
import type { ResponseTimesResult } from "../stats/responseTimesCompute";
import type { TextingStylesResult } from "../stats/textingStylesCompute";
import type { TopContactsResult } from "../stats/topContacts";
import type { TrophyShelfResult } from "../stats/trophyShelf";
import type { VolumeOverTimeResult } from "../stats/volumeOverTime";
import type { Dataset, MediaType } from "../model/types";

/** The shareable sections, in display order. The sharer picks a subset. */
/**
 * Shareable sections. `aboutOthers` marks the ones whose numbers describe
 * other people's behaviour (their reply speed, the reactions they gave you)
 * rather than only your own — never names, but still their data, so these
 * stay off until the sharer opts in.
 */
export const SHARE_SECTIONS = [
  { key: "headline", label: "Headline numbers" },
  { key: "volume", label: "Message volume" },
  { key: "heatmap", label: "Activity heatmap" },
  { key: "emoji", label: "Most-used emoji" },
  { key: "streaks", label: "Streaks" },
  { key: "media", label: "Top stickers & GIFs" },
  { key: "response", label: "Response medians", aboutOthers: true },
  { key: "reactions", label: "Reactions you got", aboutOthers: true },
  { key: "hits", label: "Greatest hits", aboutOthers: true },
  { key: "people", label: "Your people", aboutOthers: true },
  { key: "groups", label: "Groups you live in", aboutOthers: true },
  { key: "replyRanks", label: "Fastest repliers", aboutOthers: true },
  { key: "initiations", label: "Who texts first", aboutOthers: true },
  { key: "ghosting", label: "Ghosted", aboutOthers: true },
  { key: "styles", label: "How you text", aboutOthers: true },
  { key: "quiet", label: "Gone quiet", aboutOthers: true },
  { key: "nights", label: "Night owls", aboutOthers: true },
  { key: "trophies", label: "Trophy shelf", aboutOthers: true },
] as const;

/**
 * Off-by-default opt-in that reveals personal content — your own message text
 * and media, which can name or describe other people. (Sticker/GIF
 * thumbnails are public catalog items and always embed.)
 */
export const SHARE_EXTRAS = [
  {
    key: "hitContent",
    label: "Include my messages (text & media previews) in Greatest hits",
  },
  {
    key: "identities",
    label: "Include contact names and profile photos",
  },
] as const;

export type ShareSection =
  (typeof SHARE_SECTIONS)[number]["key"] | (typeof SHARE_EXTRAS)[number]["key"];

/** Sections that only describe you — the safe default selection. */
export const DEFAULT_SHARE_SECTIONS: ShareSection[] = SHARE_SECTIONS.filter(
  (section) => !("aboutOthers" in section),
).map((section) => section.key);

/** Everything, including the sections about others and the content opt-in. */
export const ALL_SHARE_SECTIONS: ShareSection[] = [
  ...SHARE_SECTIONS.map((section) => section.key),
  ...SHARE_EXTRAS.map((extra) => extra.key),
];

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

/**
 * Payload version. Bumped when the shape changes in a way older readers can't
 * render — the viewer then says the link is unsupported instead of guessing.
 * v2: whole-deck sections (people, groups, response, styles, quiet,
 * trophies) plus the sharer's own identity.
 */
export const SHARE_VERSION = 2;

export interface SharedSummary {
  v: typeof SHARE_VERSION;
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
  /* Per-chat sections. Every peer is relabelled "Contact N" / "Group N" by
     `anonymize()` before it lands here — consistently across sections, so the
     same person is the same number everywhere without ever being named. */
  /** Who made the share — always included, so the page can say whose year it
   * is and show their public profile photo. It's the sharer's own identity,
   * and they are the one creating the link. */
  self: { title: string; username?: string };
  people?: TopContactsResult;
  groups?: TopContactsResult;
  response?: ResponseTimesResult;
  styles?: TextingStylesResult;
  quiet?: GhostedChatsResult;
  nights?: NightOwlsResult;
  trophies?: TrophyShelfResult;
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
/* Shares carry fewer stickers/GIFs than the dashboard shows: with ten media
 * jobs the byte budget spread so thin that each rendered at ~60px. Three
 * apiece is the same story at roughly double the resolution. */
const TOP_MEDIA_LIMIT = 3;

const ALL_SECTIONS: ReadonlySet<ShareSection> = new Set(
  SHARE_SECTIONS.map((s) => s.key),
);

/** Per-field payload sizes, for diagnosing what a share is spending space on
 * (dev-only; `debug` is compiled out of production builds). */
function sectionSizes(summary: SharedSummary): Record<string, number> {
  const sizes: Record<string, number> = {};
  for (const [key, value] of Object.entries(summary)) {
    sizes[key] = JSON.stringify(value)?.length ?? 0;
  }
  sizes.TOTAL = JSON.stringify(summary).length;
  return sizes;
}

/**
 * Relabels peers as "Contact N" / "Group N", consistently across every
 * section of one share, and replaces their ids so nothing peer-derived (which
 * could be looked up) survives. Usernames are dropped, which also stops the
 * shared cards rendering t.me links.
 */
interface AnonPeer {
  chatId: string;
  title: string;
  username?: undefined;
}
function createAnonymizer(): (chatId: string, group: boolean) => AnonPeer {
  const seen = new Map<string, AnonPeer>();
  // Contacts and groups number independently: "Contact 1, Contact 2, Group 1".
  const counts = { contact: 0, group: 0 };
  return (chatId, group) => {
    const known = seen.get(chatId);
    if (known) return known;
    const kind = group ? "group" : "contact";
    counts[kind] += 1;
    const n = counts[kind];
    const peer: AnonPeer = {
      chatId: `shared:${group ? "g" : "c"}${n}`,
      title: `${group ? "Group" : "Contact"} ${n}`,
      username: undefined,
    };
    seen.set(chatId, peer);
    return peer;
  };
}

export function buildShare(
  dataset: Dataset,
  sections: ReadonlySet<ShareSection> = ALL_SECTIONS,
): ShareBuild {
  const thumbSources: ThumbSources = { hits: [], stickers: [], gifs: [] };
  // Opt-in: keep everyone's real name and @username. Profile photos aren't
  // embedded — the shared page loads public ones straight from t.me.
  const withIdentities = sections.has("identities");
  const anon = createAnonymizer();
  /**
   * Anonymize a peer-bearing row, keeping every numeric field. Peers with a
   * public @username stay named — they're publicly addressable on Telegram
   * already, and naming them makes the share readable (and linkable). Their
   * internal id is still replaced: ids are lookup keys, handles are public.
   */
  const hide = <T extends { chatId: string; title: string }>(row: T): T => {
    const chat = dataset.chats[row.chatId];
    // Group-ness comes from the dataset, not the call site, so a peer gets
    // the same label in every section that mentions it.
    const group = (chat?.type ?? "private") !== "private";
    const key = anon(row.chatId, group).chatId;
    // Real names travel with the identities opt-in, or when the peer has a
    // public @username; ids never do.
    if (withIdentities || chat?.username) {
      return { ...row, chatId: key };
    }
    return { ...row, ...anon(row.chatId, group) };
  };
  const summary: SharedSummary = {
    v: SHARE_VERSION,
    self: {
      title: dataset.self.displayName,
      ...(dataset.self.username ? { username: dataset.self.username } : {}),
    },
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
    const computed = streaks.compute(dataset);
    // perChat names peers — anonymize like every other per-chat section.
    summary.streaks = {
      ...computed,
      perChat: computed.perChat.map((chat) => hide(chat)),
    };
  }
  if (sections.has("hits")) {
    const hits = greatestHits.compute(dataset).hits;
    summary.hits = hits.map((hit) => {
      const shared: SharedHit = {
        reactionCount: hit.reactionCount,
        reactionEmoji: hit.reactionEmoji,
        mediaType: hit.mediaType,
      };
      if (sections.has("hitContent") && hit.text) {
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

  if (sections.has("people")) {
    summary.people = {
      chats: topDms.compute(dataset).chats.map((chat) => hide(chat)),
    };
  }
  if (sections.has("groups")) {
    summary.groups = {
      chats: topGroups.compute(dataset).chats.map((chat) => hide(chat)),
    };
  }
  if (
    sections.has("replyRanks") ||
    sections.has("initiations") ||
    sections.has("ghosting")
  ) {
    const full = computeResponseTimes(dataset);
    const ranks = sections.has("replyRanks");
    const starts = sections.has("initiations");
    const ghosts = sections.has("ghosting");
    summary.response = {
      ...full,
      // Medians live in their own section; keep them out unless picked.
      yourMedianSeconds: sections.has("response")
        ? full.yourMedianSeconds
        : null,
      theirMedianSeconds: sections.has("response")
        ? full.theirMedianSeconds
        : null,
      perChat: ranks ? full.perChat.map((c) => hide(c)) : [],
      theyReplyFastest: ranks ? full.theyReplyFastest.map((c) => hide(c)) : [],
      youReplyFastest: ranks ? full.youReplyFastest.map((c) => hide(c)) : [],
      initiations: starts ? full.initiations : null,
      youStartMost: starts ? full.youStartMost.map((c) => hide(c)) : [],
      theyStartMost: starts ? full.theyStartMost.map((c) => hide(c)) : [],
      theyGhost: ghosts ? full.theyGhost.map((c) => hide(c)) : [],
      youGhost: ghosts ? full.youGhost.map((c) => hide(c)) : [],
    };
  }
  if (sections.has("styles")) {
    const full = computeTextingStyles(dataset);
    summary.styles = {
      ...full,
      splitters: full.splitters.map((c) => hide(c)),
      essayists: full.essayists.map((c) => hide(c)),
    };
  }
  if (sections.has("quiet")) {
    const full = ghostedChats.compute(dataset);
    summary.quiet = { chats: full.chats.map((c) => hide(c)) };
  }
  if (sections.has("nights")) {
    const full = nightOwls.compute(dataset);
    summary.nights = {
      ...full,
      nightOwls: full.nightOwls.map((c) => hide(c)),
      earlyBirds: full.earlyBirds.map((c) => hide(c)),
      afterDarkOnly: full.afterDarkOnly.map((c) => hide(c)),
    };
  }
  if (sections.has("trophies")) {
    const full = trophyShelf.compute(dataset);
    summary.trophies = { trophies: full.trophies.map((t) => hide(t)) };
  }

  debug("share section sizes (chars)", sectionSizes(summary));
  return { summary, thumbSources };
}

/** Drop embedded thumbnails — the inline URL fallback can't afford them. */
/**
 * The inline-URL fallback carries the whole payload in the link, so the
 * per-chat sections (and thumbnails) are dropped there — they multiply the
 * payload while the aggregate slides still tell the story.
 */
export function stripHeavy(summary: SharedSummary): SharedSummary {
  const lean = { ...stripThumbs(summary) };
  delete lean.people;
  delete lean.groups;
  delete lean.response;
  delete lean.styles;
  delete lean.quiet;
  delete lean.trophies;
  return lean;
}

/**
 * Drop sticker/GIF entries whose thumbnail didn't fit the budget: a slot with
 * a count and no image reads as broken, and the remaining items are the ones
 * worth showing. Run after `embedThumbs`.
 */
export function dropThumblessMedia(summary: SharedSummary): SharedSummary {
  const withThumb = (items?: SharedTopMedia[]) =>
    items?.filter((item) => item.thumb !== undefined);
  return {
    ...summary,
    ...(summary.stickerTop
      ? { stickerTop: withThumb(summary.stickerTop) }
      : {}),
    ...(summary.gifTop ? { gifTop: withThumb(summary.gifTop) } : {}),
  };
}

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
/** Why a payload can't be rendered, for an accurate message to the viewer. */
export type ShareStatus = "ok" | "unsupported" | "invalid";

export function shareStatus(value: unknown): ShareStatus {
  if (typeof value !== "object" || value === null) return "invalid";
  const v = (value as Record<string, unknown>).v;
  if (typeof v === "number" && v !== SHARE_VERSION) return "unsupported";
  return isSharedSummary(value) ? "ok" : "invalid";
}

export function isSharedSummary(value: unknown): value is SharedSummary {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  const self = record.self as Record<string, unknown> | undefined;
  if (
    record.v !== SHARE_VERSION ||
    typeof self !== "object" ||
    self === null ||
    typeof self.title !== "string" ||
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
