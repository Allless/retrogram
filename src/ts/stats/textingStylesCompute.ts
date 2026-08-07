import type { Dataset } from "../model/types";
import { isNoiseChat } from "./shared/chatFilters.ts";
import { sessionThresholdMs, splitSessions } from "./shared/sessions.ts";

/*
 * Texting style: message counts are style-biased — some people send one
 * paragraph, others split the same thought into five bubbles. A *turn* is a
 * run of consecutive messages by the same sender within a conversation
 * session; measuring messages-per-turn and characters-per-message separates
 * "writes a lot" from "sends a lot of bubbles". DMs only.
 */

export interface SideStyle {
  messages: number;
  turns: number;
  words: number;
  chars: number;
}

export interface StyleRank {
  chatId: string;
  title: string;
  username?: string;
  messagesPerTurn: number;
  charsPerMessage: number;
  turns: number;
}

export interface TextingStylesResult {
  you: SideStyle;
  /** Everyone else in your DMs, combined. */
  them: SideStyle;
  /** Contacts who split thoughts into the most bubbles. */
  splitters: StyleRank[];
  /** Contacts with the longest average message. */
  essayists: StyleRank[];
}

const MIN_TURNS = 10;
const MIN_TEXT_MESSAGES = 10;
const LIMIT = 5;

const emptySide = (): SideStyle => ({
  messages: 0,
  turns: 0,
  words: 0,
  chars: 0,
});

export function computeTextingStyles(dataset: Dataset): TextingStylesResult {
  const you = emptySide();
  const them = emptySide();
  const ranks: (StyleRank & { textMessages: number })[] = [];

  const byChat = new Map<string, typeof dataset.messages>();
  for (const m of dataset.messages) {
    const list = byChat.get(m.chatId);
    if (list) list.push(m);
    else byChat.set(m.chatId, [m]);
  }

  for (const [chatId, messages] of byChat) {
    if (isNoiseChat(dataset, chatId)) continue;
    const chat = dataset.chats[chatId];
    if (chat !== undefined && chat.type !== "private") continue;

    const sorted = [...messages].sort((a, b) => a.timestamp - b.timestamp);
    const gaps: number[] = [];
    for (let i = 1; i < sorted.length; i++) {
      gaps.push(sorted[i].timestamp - sorted[i - 1].timestamp);
    }
    const sessions = splitSessions(sorted, sessionThresholdMs(gaps));

    const theirChat = { ...emptySide(), textMessages: 0 };
    for (const session of sessions) {
      let turnDirection: string | null = null;
      for (const m of session) {
        const side = m.direction === "sent" ? you : them;
        side.messages++;
        side.words += m.wordCount;
        side.chars += m.charCount;
        if (m.direction !== turnDirection) {
          side.turns++;
          turnDirection = m.direction;
          if (m.direction === "received") theirChat.turns++;
        }
        if (m.direction === "received") {
          theirChat.messages++;
          theirChat.chars += m.charCount;
          if (m.mediaType === "text") theirChat.textMessages++;
        }
      }
    }

    if (theirChat.turns >= MIN_TURNS) {
      ranks.push({
        chatId,
        title: chat?.title ?? chatId,
        username: chat?.username,
        messagesPerTurn: theirChat.messages / theirChat.turns,
        charsPerMessage:
          theirChat.textMessages > 0
            ? theirChat.chars / theirChat.textMessages
            : 0,
        turns: theirChat.turns,
        textMessages: theirChat.textMessages,
      });
    }
  }

  const splitters = [...ranks]
    .sort((a, b) => b.messagesPerTurn - a.messagesPerTurn || b.turns - a.turns)
    .slice(0, LIMIT);
  const essayists = [...ranks]
    .filter((r) => r.textMessages >= MIN_TEXT_MESSAGES)
    .sort((a, b) => b.charsPerMessage - a.charsPerMessage || b.turns - a.turns)
    .slice(0, LIMIT);

  return { you, them, splitters, essayists };
}
