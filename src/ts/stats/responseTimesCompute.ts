import type { Dataset, Message } from "../model/types";
import { isNoiseChat } from "./shared/chatFilters.ts";
import { sessionThresholdMs, splitSessions } from "./shared/sessions.ts";

/*
 * Session-based response metrics (see METHODOLOGY.md): each chat's messages
 * are segmented into conversation sessions at a per-chat threshold learned
 * from the bimodal distribution of its inter-message gaps (Halfaker et al.,
 * WWW 2015). Replies are sender switches *within* a session — overnight
 * silences and picked-up-days-later never masquerade as reply times, and no
 * arbitrary cap is needed. Whoever opens a session initiated a conversation.
 * Ghosting is a *single-sided session* (one side spoke, the other never
 * engaged) that the silent side didn't even open the next session to answer —
 * a demonstrably ignored conversation attempt, not a slow reply.
 */

export interface PerChatResponseTime {
  chatId: string;
  title: string;
  username?: string;
  yourMedianSeconds: number | null;
  theirMedianSeconds: number | null;
  yourReplies: number;
  theirReplies: number;
  replies: number;
}

export interface GhostRank {
  chatId: string;
  title: string;
  username?: string;
  /** Conversation attempts the ghosting side never engaged with. */
  ignoredAttempts: number;
  /** Conversations the ghosted side opened in this chat (the denominator). */
  attempts: number;
  /** The ghosting side's usual (median, within-session) reply time. */
  medianReplySeconds: number | null;
  messages: number;
}

export interface InitiationRank {
  chatId: string;
  title: string;
  username?: string;
  yourStarts: number;
  theirStarts: number;
}

export interface ResponseTimesResult {
  yourMedianSeconds: number | null;
  theirMedianSeconds: number | null;
  /** Timestamps are minute-granular (WhatsApp exports): show "≤1m", not "0s". */
  minuteGranularity?: boolean;
  /** DM conversation openers per side; null when too few to be meaningful. */
  initiations: { yours: number; theirs: number } | null;
  /** DMs where you do (nearly) all the conversation-starting, and inverse. */
  youStartMost: InitiationRank[];
  theyStartMost: InitiationRank[];
  perChat: PerChatResponseTime[];
  /** Contacts who answer you fastest, and the ones you answer fastest. */
  theyReplyFastest: PerChatResponseTime[];
  youReplyFastest: PerChatResponseTime[];
  /** DMs where they ignore your conversation attempts. */
  theyGhost: GhostRank[];
  /** DMs where you ignore theirs. */
  youGhost: GhostRank[];
}

const PER_CHAT_LIMIT = 6;
/** A side needs this many replies in a chat before its median can rank. */
const MIN_SIDE_REPLIES = 5;
const GHOST_LIMIT = 5;
/** Fewer ignored attempts than this is noise, not a pattern. */
const MIN_IGNORED = 2;
/** Initiation share needs a minimal sample to be worth showing. */
const MIN_INITIATIONS = 5;
/** A chat needs this many conversations to rank in the initiation lists. */
const MIN_CHAT_STARTS = 5;
const INITIATION_LIMIT = 5;

export function median(nums: number[]): number | null {
  if (nums.length === 0) return null;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
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

export function computeResponseTimes(dataset: Dataset): ResponseTimesResult {
  const yourGaps: number[] = [];
  const theirGaps: number[] = [];
  const perChat: PerChatResponseTime[] = [];
  const theyGhostRanks: GhostRank[] = [];
  const youGhostRanks: GhostRank[] = [];
  const youStartRanks: InitiationRank[] = [];
  const theyStartRanks: InitiationRank[] = [];
  let yourInitiations = 0;
  let theirInitiations = 0;

  for (const [chatId, messages] of groupByChat(dataset.messages)) {
    // Chats with no real other side pollute every metric.
    if (isNoiseChat(dataset, chatId)) continue;

    const sorted = [...messages].sort((a, b) => a.timestamp - b.timestamp);
    const title = dataset.chats[chatId]?.title ?? chatId;
    const chatType = dataset.chats[chatId]?.type;
    const isPrivate = chatType === undefined || chatType === "private";

    const gaps: number[] = [];
    for (let i = 1; i < sorted.length; i++) {
      gaps.push(sorted[i].timestamp - sorted[i - 1].timestamp);
    }
    const threshold = sessionThresholdMs(gaps);
    const sessions = splitSessions(sorted, threshold);

    const yourChatGaps: number[] = [];
    const theirChatGaps: number[] = [];
    let ignoredByYou = 0;
    let ignoredByThem = 0;
    let yourChatStarts = 0;
    let theirChatStarts = 0;

    for (let s = 0; s < sessions.length; s++) {
      const session = sessions[s];

      if (isPrivate) {
        if (session[0].direction === "sent") {
          yourInitiations++;
          yourChatStarts++;
        } else {
          theirInitiations++;
          theirChatStarts++;
        }
      }

      // Replies: sender switches within the session.
      for (let i = 1; i < session.length; i++) {
        const prev = session[i - 1];
        const curr = session[i];
        if (prev.direction === curr.direction) continue;
        const seconds = (curr.timestamp - prev.timestamp) / 1000;
        if (seconds < 0) continue;
        if (curr.direction === "sent") {
          yourGaps.push(seconds);
          yourChatGaps.push(seconds);
        } else {
          theirGaps.push(seconds);
          theirChatGaps.push(seconds);
        }
      }

      // Ghosting: a single-sided session whose silent side never even
      // re-engaged (didn't open the next session; for the chat's final
      // session, had at least a session-length of silence to do so).
      if (!isPrivate) continue;
      const openerDirection = session[0].direction;
      if (session.some((m) => m.direction !== openerDirection)) continue;
      const next = sessions[s + 1];
      if (next) {
        if (next[0].direction !== openerDirection) continue; // they came back
      } else {
        const silence =
          dataset.meta.fetchedAt - session[session.length - 1].timestamp;
        if (silence <= threshold) continue; // still pending, not ignored
      }
      if (openerDirection === "sent") ignoredByThem++;
      else ignoredByYou++;
    }

    if (yourChatGaps.length + theirChatGaps.length > 0) {
      perChat.push({
        chatId,
        title,
        username: dataset.chats[chatId]?.username,
        yourMedianSeconds: median(yourChatGaps),
        theirMedianSeconds: median(theirChatGaps),
        yourReplies: yourChatGaps.length,
        theirReplies: theirChatGaps.length,
        replies: yourChatGaps.length + theirChatGaps.length,
      });
    }

    const chatStarts = yourChatStarts + theirChatStarts;
    if (isPrivate && chatStarts >= MIN_CHAT_STARTS) {
      const rank = {
        chatId,
        title,
        username: dataset.chats[chatId]?.username,
        yourStarts: yourChatStarts,
        theirStarts: theirChatStarts,
      };
      if (yourChatStarts / chatStarts > 0.5) youStartRanks.push(rank);
      else if (theirChatStarts / chatStarts > 0.5) theyStartRanks.push(rank);
    }

    const base = {
      chatId,
      title,
      username: dataset.chats[chatId]?.username,
      messages: sorted.length,
    };
    if (ignoredByThem >= MIN_IGNORED) {
      theyGhostRanks.push({
        ...base,
        ignoredAttempts: ignoredByThem,
        attempts: yourChatStarts, // they ignored *your* openers
        medianReplySeconds: median(theirChatGaps),
      });
    }
    if (ignoredByYou >= MIN_IGNORED) {
      youGhostRanks.push({
        ...base,
        ignoredAttempts: ignoredByYou,
        attempts: theirChatStarts, // you ignored *their* openers
        medianReplySeconds: median(yourChatGaps),
      });
    }
  }

  perChat.sort((a, b) => b.replies - a.replies);
  const fastestBy = (
    seconds: (c: PerChatResponseTime) => number | null,
    replies: (c: PerChatResponseTime) => number,
  ) =>
    perChat
      .filter((c) => seconds(c) !== null && replies(c) >= MIN_SIDE_REPLIES)
      .sort((a, b) => (seconds(a) ?? 0) - (seconds(b) ?? 0))
      .slice(0, PER_CHAT_LIMIT);
  // Relative: the share of the other side's conversation attempts that got
  // ignored — 5 of 6 outranks 5 of 100.
  const ignoreRate = (r: GhostRank) =>
    r.attempts > 0 ? r.ignoredAttempts / r.attempts : 0;
  const byIgnored = (a: GhostRank, b: GhostRank) =>
    ignoreRate(b) - ignoreRate(a) ||
    b.ignoredAttempts - a.ignoredAttempts ||
    b.messages - a.messages;
  const share = (r: InitiationRank, mine: boolean) =>
    (mine ? r.yourStarts : r.theirStarts) / (r.yourStarts + r.theirStarts);
  const byShare = (mine: boolean) => (a: InitiationRank, b: InitiationRank) =>
    share(b, mine) - share(a, mine) ||
    b.yourStarts + b.theirStarts - (a.yourStarts + a.theirStarts);

  const totalInitiations = yourInitiations + theirInitiations;
  return {
    yourMedianSeconds: median(yourGaps),
    theirMedianSeconds: median(theirGaps),
    minuteGranularity: dataset.meta.platform === "whatsapp",
    initiations:
      totalInitiations >= MIN_INITIATIONS
        ? { yours: yourInitiations, theirs: theirInitiations }
        : null,
    perChat: perChat.slice(0, PER_CHAT_LIMIT),
    theyReplyFastest: fastestBy(
      (c) => c.theirMedianSeconds,
      (c) => c.theirReplies,
    ),
    youReplyFastest: fastestBy(
      (c) => c.yourMedianSeconds,
      (c) => c.yourReplies,
    ),
    youStartMost: youStartRanks.sort(byShare(true)).slice(0, INITIATION_LIMIT),
    theyStartMost: theyStartRanks
      .sort(byShare(false))
      .slice(0, INITIATION_LIMIT),
    theyGhost: theyGhostRanks.sort(byIgnored).slice(0, GHOST_LIMIT),
    youGhost: youGhostRanks.sort(byIgnored).slice(0, GHOST_LIMIT),
  };
}
