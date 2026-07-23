/**
 * Pure, gramjs-free mapping from raw Telegram-shaped records into the canonical
 * data model. Kept free of any gramjs import so it is trivially unit-testable;
 * `ingest.ts` is responsible for coercing gramjs objects into these `Raw*`
 * shapes before handing them here.
 */

import type {
  Chat,
  ChatType,
  Contact,
  MediaType,
  Message,
  MessageDirection,
} from "../model/types";

/** Only the peer fields ingestion actually extracts from gramjs. */
export interface RawPeer {
  id: string;
  kind: "user" | "group" | "channel";
  title: string;
  username?: string;
  isSelf?: boolean;
  memberCount?: number;
}

/** Only the message fields ingestion actually extracts from gramjs. */
export interface RawMessage {
  chatId: string;
  messageId: number;
  senderId: string;
  fromSelf: boolean;
  date: number; // epoch SECONDS (Telegram convention)
  text?: string;
  media?: string; // raw media kind, e.g. "MessageMediaPhoto"
  mediaId?: string; // document id for sticker/gif media
  replyToMessageId?: number;
  reactionCount?: number;
  editDate?: number; // epoch SECONDS
}

const SECONDS_TO_MS = 1000;

const MEDIA_KIND_MAP: Record<string, MediaType> = {
  photo: "photo",
  messagemediaphoto: "photo",
  video: "video",
  messagemediavideo: "video",
  voice: "voice",
  voicenote: "voice",
  audio: "audio",
  music: "audio",
  sticker: "sticker",
  gif: "gif",
  animation: "gif",
  document: "document",
  file: "document",
};

const CHAT_TYPE_MAP: Record<RawPeer["kind"], ChatType> = {
  user: "private",
  group: "group",
  channel: "channel",
};

/** Map a raw media kind to our `MediaType`, defaulting to "other". */
export function mapMediaType(kind: string | undefined): MediaType {
  if (!kind) return "text";
  return MEDIA_KIND_MAP[kind.toLowerCase()] ?? "other";
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * Derive a media kind string from a raw gramjs-shaped media object. Stickers,
 * gifs, voice notes, round videos and files all arrive as
 * "MessageMediaDocument" — the real kind lives in the document's attribute
 * list, so mapping the className alone would classify them all as "document".
 * Takes `unknown` plain data (never gramjs types) so it stays unit-testable.
 */
export function mediaKindOf(media: unknown): string | undefined {
  const record = asRecord(media);
  if (!record) return undefined;
  const className =
    typeof record.className === "string" ? record.className : undefined;
  if (className?.toLowerCase() !== "messagemediadocument") return className;

  const document = asRecord(record.document);
  const attributes = Array.isArray(document?.attributes)
    ? document.attributes
    : [];
  const names = new Set<string>();
  let isVoice = false;
  for (const attribute of attributes) {
    const attr = asRecord(attribute);
    const name =
      typeof attr?.className === "string" ? attr.className.toLowerCase() : "";
    names.add(name);
    if (name === "documentattributeaudio" && attr?.voice === true) {
      isVoice = true;
    }
  }

  if (names.has("documentattributesticker")) return "sticker";
  if (names.has("documentattributeanimated")) return "gif";
  if (isVoice) return "voice";
  if (names.has("documentattributeaudio")) return "audio";
  if (names.has("documentattributevideo")) return "video";
  return "document";
}

function countWords(text: string): number {
  const trimmed = text.trim();
  return trimmed === "" ? 0 : trimmed.split(/\s+/).length;
}

export function normalizeMessage(raw: RawMessage): Message {
  const text = raw.text ?? "";
  const message: Message = {
    id: `${raw.chatId}:${raw.messageId}`,
    chatId: raw.chatId,
    senderId: raw.senderId,
    direction: (raw.fromSelf ? "sent" : "received") satisfies MessageDirection,
    timestamp: raw.date * SECONDS_TO_MS,
    text,
    charCount: text.length,
    wordCount: countWords(text),
    mediaType: mapMediaType(raw.media),
    reactionCount: raw.reactionCount ?? 0,
  };

  if (raw.mediaId !== undefined) {
    message.mediaId = raw.mediaId;
  }
  if (raw.replyToMessageId !== undefined) {
    message.replyToId = `${raw.chatId}:${raw.replyToMessageId}`;
  }
  if (raw.editDate !== undefined) {
    message.editTimestamp = raw.editDate * SECONDS_TO_MS;
  }

  return message;
}

export function normalizePeerToChat(raw: RawPeer): Chat {
  const chat: Chat = {
    id: raw.id,
    type: CHAT_TYPE_MAP[raw.kind],
    title: raw.title,
  };
  if (raw.username !== undefined) {
    chat.username = raw.username;
  }
  if (raw.memberCount !== undefined) {
    chat.memberCount = raw.memberCount;
  }
  return chat;
}

export function normalizePeerToContact(raw: RawPeer): Contact {
  const contact: Contact = {
    id: raw.id,
    displayName: raw.title,
    isSelf: raw.isSelf ?? false,
  };
  if (raw.username !== undefined) {
    contact.username = raw.username;
  }
  return contact;
}
