/**
 * Deterministic sample dataset for developing and unit-testing stat modules
 * without Telegram credentials or the ingestion layer. Generation is seeded and
 * anchored to fixed timestamps, so `sampleDataset` is identical on every import
 * and safe to snapshot-test against.
 *
 * It deliberately covers the edge cases modules must handle: a dormant/ghosted
 * chat, a media-heavy chat, a receive-only bot, a receive-heavy group, reply
 * chains, and reactions.
 */

import type {
  Chat,
  Contact,
  Dataset,
  MediaType,
  Message,
  MessageDirection,
  PeerId,
} from "./types";

const TZ = "Europe/Berlin";
const FETCHED_AT = Date.UTC(2025, 11, 31, 12, 0, 0);
const YEAR_MS = 365 * 24 * 60 * 60 * 1000;
const FROM = FETCHED_AT - YEAR_MS;

const SELF: Contact = {
  id: "user:1",
  displayName: "Me",
  username: "me",
  isSelf: true,
};

/** Small, deterministic PRNG (mulberry32) so the fixture never uses Math.random. */
function mulberry32(seed: number): () => number {
  let state = seed;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), state | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TEXT_SNIPPETS = [
  "haha that's great 😂",
  "lunch tomorrow?",
  "coffee first, then the meeting",
  "thanks so much 🙏",
  "did you finish the project?",
  "see you at the weekend",
  "sounds good to me",
  "running late, five minutes",
  "let's sync on this tomorrow",
  "great work on the demo 🎉",
  "can you send the file?",
  "meeting moved to 3pm",
  "coffee coffee coffee ☕",
  "haha no way",
  "on my way",
];

const MEDIA_POOL: MediaType[] = ["photo", "video", "sticker"];

interface ChatSpec {
  id: PeerId;
  type: Chat["type"];
  title: string;
  count: number;
  sentBias: number; // P(message is sent by self)
  mediaBias: number; // P(message is media rather than text)
  window: [number, number]; // fraction of the year the chat is active in
  members?: Contact[]; // for groups: possible non-self senders
  peer?: Contact; // for private chats: the other party
}

const ALEX: Contact = { id: "user:100", displayName: "Alex", isSelf: false };
const SAM: Contact = { id: "user:101", displayName: "Sam", isSelf: false };
const JORDAN: Contact = {
  id: "user:102",
  displayName: "Jordan",
  isSelf: false,
};
const BOT: Contact = {
  id: "user:103",
  displayName: "Daily News",
  username: "dailynewsbot",
  isSelf: false,
};
const RILEY: Contact = { id: "user:104", displayName: "Riley", isSelf: false };
const TAYLOR: Contact = {
  id: "user:105",
  displayName: "Taylor",
  isSelf: false,
};

const CHAT_SPECS: ChatSpec[] = [
  {
    id: "user:100",
    type: "private",
    title: "Alex",
    count: 60,
    sentBias: 0.5,
    mediaBias: 0.1,
    window: [0, 1],
    peer: ALEX,
  },
  {
    // Ghosted: only active in the first quarter, then silent.
    id: "user:101",
    type: "private",
    title: "Sam",
    count: 24,
    sentBias: 0.5,
    mediaBias: 0.1,
    window: [0, 0.22],
    peer: SAM,
  },
  {
    // Media-heavy, little text.
    id: "user:102",
    type: "private",
    title: "Jordan",
    count: 34,
    sentBias: 0.5,
    mediaBias: 0.8,
    window: [0.2, 1],
    peer: JORDAN,
  },
  {
    // Receive-only bot.
    id: "user:103",
    type: "private",
    title: "Daily News",
    count: 20,
    sentBias: 0,
    mediaBias: 0,
    window: [0, 1],
    peer: BOT,
  },
  {
    // Group tied to a trip — bursts mid-year.
    id: "chat:200",
    type: "group",
    title: "Weekend Trip",
    count: 40,
    sentBias: 0.4,
    mediaBias: 0.3,
    window: [0.5, 0.68],
    members: [ALEX, RILEY, TAYLOR],
  },
  {
    // Receive-heavy work group.
    id: "chat:201",
    type: "group",
    title: "Work Standup",
    count: 45,
    sentBias: 0.12,
    mediaBias: 0.05,
    window: [0, 1],
    members: [RILEY, TAYLOR, JORDAN],
  },
];

function buildMessagesForChat(spec: ChatSpec, rnd: () => number): Message[] {
  const [start, end] = spec.window;
  const raw = Array.from({ length: spec.count }, () => {
    const timestamp = Math.round(
      FROM + (start + rnd() * (end - start)) * YEAR_MS,
    );
    const direction: MessageDirection =
      rnd() < spec.sentBias ? "sent" : "received";
    const isMedia = rnd() < spec.mediaBias;

    let senderId: PeerId;
    if (direction === "sent") {
      senderId = SELF.id;
    } else if (spec.members) {
      senderId = spec.members[Math.floor(rnd() * spec.members.length)].id;
    } else {
      senderId = spec.peer?.id ?? spec.id;
    }

    const mediaType: MediaType = isMedia
      ? MEDIA_POOL[Math.floor(rnd() * MEDIA_POOL.length)]
      : "text";
    // Media messages usually have no caption.
    const text =
      mediaType !== "text" && rnd() < 0.7
        ? ""
        : TEXT_SNIPPETS[Math.floor(rnd() * TEXT_SNIPPETS.length)];

    const reactionCount = rnd() < 0.2 ? 1 + Math.floor(rnd() * 3) : 0;
    const replyRoll = rnd(); // used below once ids exist

    return {
      timestamp,
      direction,
      senderId,
      mediaType,
      text,
      reactionCount,
      replyRoll,
    };
  }).sort((a, b) => a.timestamp - b.timestamp);

  return raw.map((m, index) => {
    const id = `${spec.id}:${index}`;
    // ~25% of non-first messages reply to some earlier message in the chat.
    const replyToId =
      index > 0 && m.replyRoll < 0.25
        ? `${spec.id}:${Math.floor(m.replyRoll * index)}`
        : undefined;
    return {
      id,
      chatId: spec.id,
      senderId: m.senderId,
      direction: m.direction,
      timestamp: m.timestamp,
      text: m.text,
      charCount: m.text.length,
      wordCount: m.text.trim() === "" ? 0 : m.text.trim().split(/\s+/).length,
      mediaType: m.mediaType,
      replyToId,
      reactionCount: m.reactionCount,
    } satisfies Message;
  });
}

function buildSampleDataset(): Dataset {
  const rnd = mulberry32(0x5eed);

  const messages = CHAT_SPECS.flatMap((spec) =>
    buildMessagesForChat(spec, rnd),
  ).sort((a, b) => a.timestamp - b.timestamp);

  const chats: Record<PeerId, Chat> = {};
  const contacts: Record<PeerId, Contact> = { [SELF.id]: SELF };

  for (const spec of CHAT_SPECS) {
    chats[spec.id] = {
      id: spec.id,
      type: spec.type,
      title: spec.title,
      memberCount: spec.members ? spec.members.length + 1 : undefined,
    };
    const parties = spec.members ?? (spec.peer ? [spec.peer] : []);
    for (const party of parties) {
      contacts[party.id] = party;
    }
  }

  return {
    self: SELF,
    contacts,
    chats,
    messages,
    meta: {
      fetchedAt: FETCHED_AT,
      messageCount: messages.length,
      dateRange: {
        from: messages[0]?.timestamp ?? FROM,
        to: messages[messages.length - 1]?.timestamp ?? FETCHED_AT,
      },
      timezone: TZ,
      partial: false,
    },
  };
}

export const sampleDataset: Dataset = buildSampleDataset();
