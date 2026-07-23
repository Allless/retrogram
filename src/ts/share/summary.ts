/**
 * The anonymized share payload. Built ONLY from aggregate stat results that
 * carry no identities — no chat titles, no usernames, no message text, no
 * avatars. Anything per-chat (top DMs, ghost lists, greatest-hit snippets) is
 * reduced to bare numbers before it gets here. `summary.test.ts` asserts the
 * serialized payload leaks none of the fixture's names.
 */

import { activityHeatmap } from "../stats/activityHeatmap";
import { emojiFrequency } from "../stats/emojiFrequency";
import { greatestHits } from "../stats/greatestHits";
import { reactions } from "../stats/reactions";
import { responseTimes } from "../stats/responseTimes";
import { streaks } from "../stats/streaks";
import { topDms } from "../stats/topContacts";
import { volumeOverTime } from "../stats/volumeOverTime";

import type { ActivityHeatmapResult } from "../stats/activityHeatmap";
import type { EmojiCount } from "../stats/emojiFrequency";
import type { ReactionCount } from "../stats/reactions";
import type { StreaksResult } from "../stats/streaks";
import type { VolumeOverTimeResult } from "../stats/volumeOverTime";
import type { Dataset } from "../model/types";

export interface SharedSummary {
  v: 1;
  messageCount: number;
  from: number; // epoch ms
  to: number; // epoch ms
  timezone: string;
  volume: VolumeOverTimeResult;
  heatmap: ActivityHeatmapResult;
  yourMedianSeconds: number | null;
  theirMedianSeconds: number | null;
  topEmoji: EmojiCount[];
  reactionsGiven: ReactionCount[];
  reactionsReceived: ReactionCount[];
  streaks: StreaksResult;
  /** Message count of the busiest DM — count only, never the name. */
  topChatMessages: number;
  /** Reactions on the single most-reacted message, and its emoji. */
  topHitReactions: number;
  topHitEmoji: string[];
}

export function buildSummary(dataset: Dataset): SharedSummary {
  const response = responseTimes.compute(dataset);
  const hit = greatestHits.compute(dataset).hits[0];

  return {
    v: 1,
    messageCount: dataset.meta.messageCount,
    from: dataset.meta.dateRange.from,
    to: dataset.meta.dateRange.to,
    timezone: dataset.meta.timezone,
    volume: volumeOverTime.compute(dataset),
    heatmap: activityHeatmap.compute(dataset),
    yourMedianSeconds: response.yourMedianSeconds,
    theirMedianSeconds: response.theirMedianSeconds,
    topEmoji: emojiFrequency.compute(dataset).topEmoji,
    reactionsGiven: reactions.compute(dataset).given,
    reactionsReceived: reactions.compute(dataset).received,
    streaks: streaks.compute(dataset),
    topChatMessages: topDms.compute(dataset).chats[0]?.messages ?? 0,
    topHitReactions: hit?.reactionCount ?? 0,
    topHitEmoji: hit?.reactionEmoji ?? [],
  };
}

/** Structural guard for payloads that arrive from a link. */
export function isSharedSummary(value: unknown): value is SharedSummary {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    record.v === 1 &&
    typeof record.messageCount === "number" &&
    typeof record.timezone === "string" &&
    typeof record.volume === "object" &&
    record.volume !== null &&
    typeof record.heatmap === "object" &&
    record.heatmap !== null &&
    Array.isArray(record.topEmoji) &&
    typeof record.streaks === "object" &&
    record.streaks !== null
  );
}
