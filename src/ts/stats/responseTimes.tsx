import type { FunctionComponent } from "preact";

import { PeerAvatar, PeerName } from "../media/avatars";
import { defineStat } from "./registry";
import type { Dataset, Message } from "../model/types";

export interface PerChatResponseTime {
  chatId: string;
  title: string;
  yourMedianSeconds: number | null;
  replies: number;
}

export interface GhostRank {
  chatId: string;
  title: string;
  username?: string;
  /** |L_them − L_you| × log2(1 + opportunities) — higher = more one-sided. */
  coefficient: number;
  /** The ghosting side's typical reply time (geometric-style mean). */
  typicalReplySeconds: number;
  /** Reply opportunities of the ghosting side (incl. a pending unanswered run). */
  opportunities: number;
  messages: number;
}

export interface ResponseTimesResult {
  yourMedianSeconds: number | null;
  theirMedianSeconds: number | null;
  perChat: PerChatResponseTime[];
  /** DMs where they leave you hanging the most. */
  theyGhost: GhostRank[];
  /** DMs where you leave them hanging the most. */
  youGhost: GhostRank[];
}

// Gaps longer than this are treated as "not a reply" (e.g. overnight or
// picking a conversation back up days later) so they don't distort medians.
const REPLY_CAP_MS = 24 * 60 * 60 * 1000;
const PER_CHAT_LIMIT = 10;

/*
 * Ghosting is asymmetry: a chat where both sides answer in two days is a slow
 * cadence, not ghosting; a chat where you answer in minutes and they answer in
 * days is. Each reply gap scores log2(1 + hours) — 1m ≈ 0, 1h = 1, 1d ≈ 4.6,
 * 1w ≈ 7.4 — so the tail counts but a single vacation gap can't dominate, and
 * a run left unanswered for over a day counts as a pending reply with its
 * elapsed silence (capped at 30 days). A side's level is the mean of its
 * scores; chats rank by the level difference × log2(1 + opportunities).
 * Groups are excluded — only your own messages are ingested there.
 */
const HOUR_SECONDS = 3600;
const MIN_OPPORTUNITIES = 3;
const GHOST_LIMIT = 5;
const PENDING_MIN_MS = REPLY_CAP_MS;
const PENDING_CAP_HOURS = 30 * 24;

function median(nums: number[]): number | null {
  if (nums.length === 0) return null;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

function mean(nums: number[]): number {
  return nums.reduce((sum, n) => sum + n, 0) / nums.length;
}

function latencyScore(seconds: number): number {
  return Math.log2(1 + seconds / HOUR_SECONDS);
}

function typicalSeconds(level: number): number {
  return (2 ** level - 1) * HOUR_SECONDS;
}

function groupByChat(messages: Message[]): Map<string, Message[]> {
  const byChat = new Map<string, Message[]>();
  for (const message of messages) {
    const existing = byChat.get(message.chatId);
    if (existing) {
      existing.push(message);
    } else {
      byChat.set(message.chatId, [message]);
    }
  }
  return byChat;
}

interface GhostSide {
  chatId: string;
  title: string;
  username?: string;
  level: number;
  opportunities: number;
  messages: number;
  coefficient: number;
}

function compute(dataset: Dataset): ResponseTimesResult {
  const yourGaps: number[] = [];
  const theirGaps: number[] = [];
  const perChat: PerChatResponseTime[] = [];
  const theyGhostRanks: GhostSide[] = [];
  const youGhostRanks: GhostSide[] = [];

  for (const [chatId, messages] of groupByChat(dataset.messages)) {
    const sorted = [...messages].sort((a, b) => a.timestamp - b.timestamp);
    const title = dataset.chats[chatId]?.title ?? chatId;
    const yourChatGaps: number[] = [];
    const yourScores: number[] = [];
    const theirScores: number[] = [];

    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      const curr = sorted[i];
      if (prev.direction === curr.direction) continue;

      const gapMs = curr.timestamp - prev.timestamp;
      if (gapMs < 0) continue;
      const seconds = gapMs / 1000;

      // received → sent is you replying; sent → received is them replying.
      const yours = prev.direction === "received" && curr.direction === "sent";
      (yours ? yourScores : theirScores).push(latencyScore(seconds));

      if (gapMs > REPLY_CAP_MS) continue;
      if (yours) {
        yourGaps.push(seconds);
        yourChatGaps.push(seconds);
      } else {
        theirGaps.push(seconds);
      }
    }

    if (yourChatGaps.length > 0) {
      perChat.push({
        chatId,
        title,
        yourMedianSeconds: median(yourChatGaps),
        replies: yourChatGaps.length,
      });
    }

    const chatType = dataset.chats[chatId]?.type;
    if (chatType !== undefined && chatType !== "private") continue;

    // The chat's final run is a pending reply for whoever fell silent — but
    // only once the silence outlasts a day; a fresh last message is just the
    // natural end of a conversation.
    const last = sorted[sorted.length - 1];
    if (last) {
      const silenceMs = dataset.meta.fetchedAt - last.timestamp;
      if (silenceMs > PENDING_MIN_MS) {
        const hours = Math.min(
          silenceMs / 1000 / HOUR_SECONDS,
          PENDING_CAP_HOURS,
        );
        const score = Math.log2(1 + hours);
        (last.direction === "received" ? yourScores : theirScores).push(score);
      }
    }

    if (
      yourScores.length < MIN_OPPORTUNITIES ||
      theirScores.length < MIN_OPPORTUNITIES
    ) {
      continue;
    }

    const yourLevel = mean(yourScores);
    const theirLevel = mean(theirScores);
    const delta = theirLevel - yourLevel;
    if (delta === 0) continue;
    const evidence = Math.log2(1 + yourScores.length + theirScores.length);

    const side: Omit<GhostSide, "level" | "opportunities"> = {
      chatId,
      title,
      username: dataset.chats[chatId]?.username,
      messages: sorted.length,
      coefficient: Math.abs(delta) * evidence,
    };
    if (delta > 0) {
      theyGhostRanks.push({
        ...side,
        level: theirLevel,
        opportunities: theirScores.length,
      });
    } else {
      youGhostRanks.push({
        ...side,
        level: yourLevel,
        opportunities: yourScores.length,
      });
    }
  }

  perChat.sort((a, b) => b.replies - a.replies);

  const toRank = (side: GhostSide): GhostRank => ({
    chatId: side.chatId,
    title: side.title,
    username: side.username,
    coefficient: side.coefficient,
    typicalReplySeconds: typicalSeconds(side.level),
    opportunities: side.opportunities,
    messages: side.messages,
  });
  const byCoefficient = (a: GhostSide, b: GhostSide) =>
    b.coefficient - a.coefficient;

  return {
    yourMedianSeconds: median(yourGaps),
    theirMedianSeconds: median(theirGaps),
    perChat: perChat.slice(0, PER_CHAT_LIMIT),
    theyGhost: theyGhostRanks
      .sort(byCoefficient)
      .slice(0, GHOST_LIMIT)
      .map(toRank),
    youGhost: youGhostRanks
      .sort(byCoefficient)
      .slice(0, GHOST_LIMIT)
      .map(toRank),
  };
}

function humanizeSeconds(seconds: number | null): string {
  if (seconds === null) return "—";
  const s = Math.round(seconds);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.round(s / 60)}m`;
  if (s < 86400) return `${Math.round(s / 3600)}h`;
  return `${Math.round(s / 86400)}d`;
}

const GhostList: FunctionComponent<{
  heading: string;
  chats: GhostRank[];
}> = ({ heading, chats }) =>
  chats.length === 0 ? null : (
    <div class="response-section">
      <h4>{heading}</h4>
      <ul class="response-per-chat">
        {chats.map((chat) => (
          <li key={chat.chatId}>
            <PeerAvatar
              peerId={chat.chatId}
              title={chat.title}
              username={chat.username}
            />
            <PeerName
              class="chat-title"
              peerId={chat.chatId}
              title={chat.title}
              username={chat.username}
            />
            <span class="chat-detail">
              ~{humanizeSeconds(chat.typicalReplySeconds)} reply ·{" "}
              {chat.messages} msgs
            </span>
          </li>
        ))}
      </ul>
    </div>
  );

const Card: FunctionComponent<{ result: ResponseTimesResult }> = ({
  result,
}) => (
  <div class="response-times">
    <div class="response-medians">
      <div class="response-median">
        <span class="value">{humanizeSeconds(result.yourMedianSeconds)}</span>
        <span class="label">your median reply</span>
      </div>
      <div class="response-median">
        <span class="value">{humanizeSeconds(result.theirMedianSeconds)}</span>
        <span class="label">their median reply</span>
      </div>
    </div>
    <GhostList heading="Ghosting you the most" chats={result.theyGhost} />
    <GhostList heading="Ghosted by you the most" chats={result.youGhost} />
  </div>
);

export const responseTimes = defineStat<ResponseTimesResult>({
  id: "response-times",
  title: "Response times",
  description: "How fast you both reply — and who ghosts whom.",
  compute,
  Card,
});
