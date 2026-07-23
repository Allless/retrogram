/**
 * "Greatest hits" — your messages that collected the most reactions. Only
 * your own posts count (reactions on other people's messages are theirs to
 * brag about).
 */

import type { FunctionComponent } from "preact";

import { formatDay } from "./shared/formatDate";
import { defineStat } from "./registry";
import type { Dataset, MediaType } from "../model/types";

export interface GreatestHit {
  messageId: string;
  chatId: string;
  chatTitle: string;
  text: string;
  mediaType: MediaType;
  reactionCount: number;
  /** Distinct received-reaction glyphs, most-counted first. */
  reactionEmoji: string[];
  timestamp: number;
}

export interface GreatestHitsResult {
  hits: GreatestHit[];
  timezone: string;
}

const MAX_HITS = 3;
const SNIPPET_LENGTH = 100;

const MEDIA_LABELS: Record<MediaType, string> = {
  text: "a message",
  photo: "a photo",
  video: "a video",
  voice: "a voice message",
  audio: "an audio file",
  sticker: "a sticker",
  gif: "a GIF",
  document: "a file",
  other: "a message",
};

function compute(dataset: Dataset): GreatestHitsResult {
  const hits = dataset.messages
    .filter((m) => m.direction === "sent" && m.reactionCount > 0)
    // Count desc; older first, then id, for deterministic ties.
    .sort(
      (a, b) =>
        b.reactionCount - a.reactionCount ||
        a.timestamp - b.timestamp ||
        (a.id < b.id ? -1 : 1),
    )
    .slice(0, MAX_HITS)
    .map((m) => ({
      messageId: m.id,
      chatId: m.chatId,
      chatTitle: dataset.chats[m.chatId]?.title ?? m.chatId,
      text: m.text,
      mediaType: m.mediaType,
      reactionCount: m.reactionCount,
      reactionEmoji: [...(m.reactions ?? [])]
        .sort((a, b) => b.count - a.count)
        .map((r) => r.emoticon),
      timestamp: m.timestamp,
    }));

  return { hits, timezone: dataset.meta.timezone };
}

function snippet(hit: GreatestHit): string | null {
  if (!hit.text) return null;
  return hit.text.length > SNIPPET_LENGTH
    ? `${hit.text.slice(0, SNIPPET_LENGTH)}…`
    : hit.text;
}

const Card: FunctionComponent<{ result: GreatestHitsResult }> = ({
  result,
}) => {
  if (result.hits.length === 0) {
    return <p class="muted">No reactions on your messages yet.</p>;
  }

  return (
    <ol class="hits">
      {result.hits.map((hit) => (
        <li key={hit.messageId} class="hit">
          <div class="hit-head">
            <span class="hit-count">{hit.reactionCount}</span>
            <span class="hit-emoji">{hit.reactionEmoji.join(" ")}</span>
          </div>
          {snippet(hit) ? (
            <blockquote class="hit-text">{snippet(hit)}</blockquote>
          ) : (
            <blockquote class="hit-text muted">
              {MEDIA_LABELS[hit.mediaType]}
            </blockquote>
          )}
          <span class="muted hit-meta">
            {hit.chatTitle} · {formatDay(hit.timestamp, result.timezone)}
          </span>
        </li>
      ))}
    </ol>
  );
};

export const greatestHits = defineStat<GreatestHitsResult>({
  id: "greatest-hits",
  title: "Greatest hits",
  description: "Your messages that racked up the most reactions.",
  compute,
  Card,
});
