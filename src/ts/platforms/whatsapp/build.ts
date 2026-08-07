/**
 * Turns parsed WhatsApp exports (one per chat) into the common `Dataset`.
 * All ids are `wa:`-prefixed — the platform invariant that keeps them from
 * colliding with Telegram's in the shared caches.
 *
 * Coverage is whatever the user exported, so `meta.partial` is always true.
 * `fetchedAt` is the newest message: exports don't record when they were
 * made, and this keeps "fetched N days ago" honest enough.
 */

import type {
  Chat,
  Contact,
  Dataset,
  Message,
  PeerId,
} from "../../model/types";
import type { ParsedChat } from "./parse";

export interface ParsedExport {
  fileName: string;
  chat: ParsedChat;
}

const peerIdOf = (name: string): PeerId => `wa:${name}`;

function slugOf(title: string): string {
  return title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-");
}

/** "WhatsApp Chat with L.txt" → "L"; otherwise the other side, or the file.
 * Browser download dedupe suffixes ("… (1).txt") are stripped so the same
 * chat re-downloaded resolves to the same identity. */
function chatTitle(parsed: ParsedExport, selfName: string): string {
  const stem = parsed.fileName.replace(/\.txt$/i, "").replace(/ \(\d+\)$/, "");
  const fromName = /whatsapp chat with (.+)$/i.exec(stem)?.[1];
  if (fromName) return fromName;
  const others = parsed.chat.participants.filter((p) => p !== selfName);
  if (others.length === 1) return others[0];
  return stem;
}

export interface BuildResult {
  dataset: Dataset;
  /** Chats skipped because another upload already claimed their identity. */
  skippedConflicts: string[];
}

export function buildWhatsappDataset(
  exports: ParsedExport[],
  selfName: string,
): BuildResult {
  const self: Contact = {
    id: peerIdOf(selfName),
    displayName: selfName,
    isSelf: true,
  };
  const contacts: Record<PeerId, Contact> = { [self.id]: self };
  const chats: Record<PeerId, Chat> = {};
  const messages: Message[] = [];
  const skippedConflicts: string[] = [];

  for (const parsed of exports) {
    const title = chatTitle(parsed, selfName);
    const chatId: PeerId = `wa:chat:${slugOf(title)}`;
    if (chats[chatId]) {
      // Identical re-upload → drop silently; same chat with different
      // content (e.g. an older export) → conflict, keep the first.
      const existing = messages.filter((m) => m.chatId === chatId);
      const identical =
        existing.length === parsed.chat.messages.length &&
        existing[0]?.timestamp === parsed.chat.messages[0]?.timestamp;
      if (!identical) skippedConflicts.push(parsed.fileName);
      continue;
    }

    chats[chatId] = {
      id: chatId,
      type: parsed.chat.participants.length > 2 ? "group" : "private",
      title,
      memberCount: parsed.chat.participants.length,
    };

    for (const name of parsed.chat.participants) {
      const id = peerIdOf(name);
      if (!contacts[id]) {
        contacts[id] = { id, displayName: name, isSelf: name === selfName };
      }
    }

    parsed.chat.messages.forEach((m, i) => {
      messages.push({
        id: `${chatId}:${i}`,
        chatId,
        senderId: peerIdOf(m.sender),
        direction: m.sender === selfName ? "sent" : "received",
        timestamp: m.timestamp,
        text: m.text,
        charCount: m.text.length,
        wordCount: m.text.split(/\s+/).filter(Boolean).length,
        mediaType: m.mediaType,
        ...(m.attachedFile ? { mediaId: `wa:media:${m.attachedFile}` } : {}),
        reactionCount: 0,
      });
    });
  }

  messages.sort((a, b) => a.timestamp - b.timestamp);
  const first = messages[0]?.timestamp ?? 0;
  const last = messages[messages.length - 1]?.timestamp ?? 0;

  return {
    dataset: {
      self,
      contacts,
      chats,
      messages,
      meta: {
        fetchedAt: last,
        messageCount: messages.length,
        dateRange: { from: first, to: last },
        // Exports are wall-clock with no zone; parsed as UTC, bucketed as UTC.
        timezone: "UTC",
        partial: true,
        platform: "whatsapp",
      },
    },
    skippedConflicts,
  };
}
