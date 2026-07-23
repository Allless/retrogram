/**
 * The canonical data model — the single contract every analytics module reads.
 *
 * Stat modules are pure functions of a `Dataset` and must never touch gramjs.
 * Only the ingestion layer knows Telegram exists; it produces a `Dataset`, and
 * everything downstream consumes this shape.
 */

export type PeerId = string; // stringified Telegram id, e.g. "user:12345" / "chat:678"

export interface Contact {
  id: PeerId;
  displayName: string;
  username?: string;
  isSelf: boolean;
}

export type ChatType = "private" | "group" | "channel";

export interface Chat {
  id: PeerId;
  type: ChatType;
  title: string;
  username?: string; // public @username, if any → enables a t.me link
  memberCount?: number;
}

export type MessageDirection = "sent" | "received";

export type MediaType =
  | "text"
  | "photo"
  | "video"
  | "voice"
  | "audio"
  | "sticker"
  | "gif"
  | "document"
  | "other";

export interface Message {
  id: string; // `${chatId}:${telegramMessageId}` — globally unique
  chatId: PeerId;
  senderId: PeerId;
  direction: MessageDirection; // "sent" = authored by self
  timestamp: number; // epoch ms, UTC
  text: string; // "" when the message has no text
  charCount: number;
  wordCount: number;
  mediaType: MediaType;
  mediaId?: string; // document id for sticker/gif media — groups identical files
  replyToId?: string; // another Message.id
  reactionCount: number;
  editTimestamp?: number; // epoch ms, UTC
}

export interface DatasetMeta {
  fetchedAt: number; // epoch ms — modules derive "now" from this, never Date.now()
  messageCount: number;
  dateRange: { from: number; to: number };
  timezone: string; // IANA tz used for all bucketing, e.g. "Europe/Berlin"
  partial: boolean; // true if the fetch was capped, interrupted, or rate-limited short
}

export interface Dataset {
  self: Contact;
  contacts: Record<PeerId, Contact>;
  chats: Record<PeerId, Chat>;
  messages: Message[]; // chronological (ascending timestamp)
  meta: DatasetMeta;
}
