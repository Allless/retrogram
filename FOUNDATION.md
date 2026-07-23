# Retrogram — Foundation Spec

The shared substrate every analytics module depends on. Build this **first**; once
the schema, fixture, and module interface exist, the eight stat modules and the
ingestion layer can be developed in parallel on separate tracks.

The guiding rule: **stat modules never touch gramjs.** They are pure functions of a
normalized `Dataset`. Only the ingestion layer knows Telegram exists.

---

## 1. Canonical data model — `src/ts/model/types.ts`

This is _the_ contract. Everything reads it; nothing may change it unilaterally.

```ts
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
  direction: MessageDirection; // sent = from self
  timestamp: number; // epoch ms, UTC
  text: string; // "" when no text
  charCount: number;
  wordCount: number;
  mediaType: MediaType;
  replyToId?: string; // another Message.id
  reactionCount: number;
  editTimestamp?: number; // epoch ms, UTC
}

export interface DatasetMeta {
  fetchedAt: number; // epoch ms
  messageCount: number;
  dateRange: { from: number; to: number };
  timezone: string; // IANA tz used for bucketing, e.g. "Europe/Berlin"
  partial: boolean; // true if the fetch was capped, interrupted, or rate-limited short
}

export interface Dataset {
  self: Contact;
  contacts: Record<PeerId, Contact>;
  chats: Record<PeerId, Chat>;
  messages: Message[]; // chronological (ascending timestamp)
  meta: DatasetMeta;
}
```

Notes:

- `messages` is a flat chronological array — cheapest to iterate for time-series and
  the easiest fixture shape. Modules that need per-chat grouping do it themselves.
- `timezone` lives on the dataset so every heatmap/volume module buckets identically.
- `partial` lets the UI show an honest "based on the last N messages" caveat.

---

## 2. Stat module interface — `src/ts/stats/registry.ts`

Every stat is a **pure `compute`** (unit-testable against the fixture) plus a
presentation **`Card`**. The dashboard renders the registry; adding a stat is a
one-line registration.

```ts
import type { FunctionComponent } from "preact";
import type { Dataset } from "../model/types";

export interface StatModule<TResult = unknown> {
  id: string; // stable, kebab-case
  title: string;
  description: string;
  compute: (dataset: Dataset) => TResult;
  Card: FunctionComponent<{ result: TResult }>;
}

// Helper to preserve the TResult type link between compute and Card.
export function defineStat<TResult>(
  m: StatModule<TResult>,
): StatModule<TResult> {
  return m;
}

export const STAT_REGISTRY: StatModule[] = [
  /* volumeOverTime, activityHeatmap, ... registered here */
];
```

Contract for every module:

- `compute` is **pure and synchronous** — no I/O, no gramjs, no `Date.now()` baked
  into results (derive "now" from `dataset.meta.fetchedAt` so tests are deterministic).
- `compute` must tolerate `partial` datasets and empty chats without throwing.
- One unit test file per module, run against the fixture.

---

## 3. Shared utilities — `src/ts/stats/shared/`

Cross-cutting helpers defined once so modules stay consistent.

- **`time.ts`** — timezone-aware bucketing. Signatures:
  - `hourOfWeek(ts: number, tz: string): number` (0–167)
  - `dayKey(ts: number, tz: string): string` ("YYYY-MM-DD" in tz)
  - `bucketByDay/Week/Month(messages, tz): Map<string, Message[]>`
- **`text.ts`** — tokenization shared by word/emoji frequency (and others):
  - `tokenize(text: string): { words: string[]; emoji: string[] }`
  - Lowercase, strip punctuation/URLs, split graphemes for emoji, filter a small
    stopword list.

---

## 4. Sample fixture — `src/ts/model/fixture.ts`

The parallelism unlock: a **deterministic** normalized `Dataset` so all stat modules
can be built and tested with zero Telegram credentials and zero dependency on
ingestion.

- Export `sampleDataset: Dataset`.
- ~5–8 chats (mix of private/group), a couple hundred messages spanning ~12 months.
- Deterministic generation (seeded, no randomness at import time — `Math.random` is
  banned in some contexts anyway) so snapshot tests are stable.
- Cover the edge cases modules must handle: a dormant/ghosted chat, a media-only
  chat, reply chains (for response-time), reactions, and a chat with only received
  messages.

---

## 5. Ingestion layer — `src/ts/ingestion/` (Track A, serial)

Turns a connected gramjs client into a `Dataset`. The only Telegram-aware code.

```ts
export interface IngestOptions {
  onProgress?: (p: {
    chatsDone: number;
    chatsTotal: number;
    messages: number;
  }) => void;
  maxMessagesPerChat?: number; // guard against huge histories
  signal?: AbortSignal;
}

export function ingest(
  client: TelegramClient,
  opts?: IngestOptions,
): Promise<Dataset>;
```

- `ingest.ts` — iterate dialogs, page history via `client.iterMessages`, accumulate.
- `normalize.ts` — pure mapping of a raw gramjs message → `Message` (and peers →
  `Contact`/`Chat`). Unit-testable in isolation.
- `backoff.ts` — FLOOD_WAIT handling: catch the wait error, sleep the required
  seconds, resume. Exponential backoff on other transient errors.
- Sets `meta.partial = true` if any cap/abort/rate-limit truncates the pull.

---

## 6. Cache layer — `src/ts/store/datasetCache.ts`

IndexedDB persistence so reopening doesn't re-fetch and every module reads one source.

- `saveDataset(d: Dataset): Promise<void>`
- `loadDataset(): Promise<Dataset | null>`
- `clearDataset(): Promise<void>` (also called on disconnect)
- Single record keyed by the logged-in self id; store the raw normalized `Dataset`.

---

## 7. Proposed file layout

```
src/ts/
  model/
    types.ts          # §1 — the contract
    fixture.ts        # §4 — sample dataset
  ingestion/
    ingest.ts         # §5
    normalize.ts
    backoff.ts
  store/
    datasetCache.ts   # §6
  stats/
    registry.ts       # §2 — StatModule interface + STAT_REGISTRY
    shared/
      time.ts         # §3
      text.ts         # §3
    volumeOverTime.ts
    activityHeatmap.ts
    topContacts.ts
    responseTimes.ts
    ghostedChats.ts
    wordEmojiFrequency.ts
    streaks.ts
    wrapped.ts        # aggregates other stats — build last
  dashboard/
    Dashboard.tsx     # renders STAT_REGISTRY (replaces the current stub)
  auth/               # already scaffolded
```

---

## 8. Build order & parallelization

**Phase 0 — foundation (serial, one focused pass).** Must land before fan-out:
`model/types.ts` → `stats/registry.ts` (interface) → `model/fixture.ts` →
`stats/shared/{time,text}.ts`.

**Phase 1 — two concurrent tracks:**

- **Track A (data plumbing, one owner):** `ingestion/*` → `store/datasetCache.ts`,
  wired to the existing auth flow.
- **Track B (analytics, fan out — one agent per module):** the seven independent
  stats, each `compute` + `Card` + a unit test against the fixture. Order-independent.
- The dashboard shell (layout, card frame, loading/empty states) can proceed here too.

**Phase 2 — dependent pieces:**

- `stats/wrapped.ts` — consumes other modules' `compute` outputs; build after them.
- Share-image rendering (canvas → PNG) — separable track.
- Swap `Dashboard.tsx` from the stub to the registry renderer; connect ingestion +
  cache so real data flows.

**Acceptance per stat module:** pure `compute` with a passing unit test against
`sampleDataset`, no gramjs import, tolerates empty/partial input.
