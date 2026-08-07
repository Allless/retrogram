/**
 * Telegram media fetching (gramjs): downloads sticker/gif previews, hit
 * previews, and profile photos into persistable blobs. Telegram file
 * references only live for the session that ingested them, so downloads
 * recover expired/missing refs by re-fetching the carrying message.
 *
 * The gramjs client and message are typed structurally (a single documented
 * cast), mirroring `ingest.ts`, to avoid depending on gramjs' internal types.
 */

import type { TelegramClient } from "telegram";

import { debug } from "../../debug";
import type { StoredBlob } from "../../store/datasetCache";
import type { MediaResolver } from "../../media/downloadMedia";
import type { HitRefs, MediaRefs, PeerRefs } from "./ingest";

interface DownloaderClient {
  downloadMedia(
    message: unknown,
    params?: { thumb?: number },
  ): Promise<unknown>;
  downloadProfilePhoto(
    entity: unknown,
    params?: { isBig?: boolean },
  ): Promise<unknown>;
  getMessages(entity: unknown, params?: { ids: number[] }): Promise<unknown[]>;
}

/**
 * Re-fetch a single message to get a fresh downloadable reference. The ref
 * maps only live for the session that ingested, and Telegram file references
 * expire — this recovers both cases: `Message.id` encodes `chatId:messageId`,
 * and the peer map resolves the chat entity.
 */
async function refreshMessageRef(
  client: TelegramClient,
  peers: PeerRefs,
  messageId: string,
): Promise<unknown | null> {
  const parts = messageId.split(":");
  const id = Number(parts.pop());
  const entity = peers.get(parts.join(":"));
  if (!entity || !Number.isFinite(id)) return null;
  try {
    const api = client as unknown as DownloaderClient;
    const [message] = await api.getMessages(entity, { ids: [id] });
    return message ?? null;
  } catch {
    return null;
  }
}

/** Copy downloaded bytes into a persistable blob record, or null if empty. */
function toStoredBlob(
  bytes: unknown,
  type: string,
  video: boolean,
): StoredBlob | null {
  if (!(bytes instanceof Uint8Array) || bytes.length === 0) return null;
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return { bytes: copy.buffer, type, video };
}

function mimeOf(message: unknown): string | undefined {
  const doc = (message as { document?: { mimeType?: unknown } } | null)
    ?.document;
  return typeof doc?.mimeType === "string" ? doc.mimeType : undefined;
}

/**
 * Usable thumbnails on the message's document. gramjs sorts thumbs ascending
 * by size and drops vector `PhotoPathSize` outlines, so the last index is the
 * largest real image — never ask for index 0, it's usually a tiny stripped
 * preview whose raw bytes aren't even a decodable JPEG.
 */
function thumbCount(message: unknown): number {
  const doc = (message as { document?: { thumbs?: unknown } } | null)?.document;
  const thumbs = doc?.thumbs;
  if (!Array.isArray(thumbs)) return 0;
  return thumbs.filter(
    (t) => (t as { className?: unknown } | null)?.className !== "PhotoPathSize",
  ).length;
}

async function downloadLargestThumb(
  api: DownloaderClient,
  message: unknown,
): Promise<StoredBlob | null> {
  const count = thumbCount(message);
  if (count === 0) return null;
  const bytes = await api.downloadMedia(message, { thumb: count - 1 });
  return toStoredBlob(bytes, "image/jpeg", false);
}

async function downloadPreviewBlob(
  client: TelegramClient,
  message: unknown,
): Promise<StoredBlob | null> {
  const mime = mimeOf(message);
  const api = client as unknown as DownloaderClient;

  try {
    // Lottie stickers are JSON animations — nothing an <img>/<video> can show.
    if (mime === "application/x-tgsticker") {
      return await downloadLargestThumb(api, message);
    }

    const isVideo = mime?.startsWith("video/") ?? false;
    const full = toStoredBlob(
      await api.downloadMedia(message, {}),
      mime ?? "image/webp",
      isVideo,
    );
    if (full) return full;

    // Empty full download — fall back to the largest static thumbnail.
    return await downloadLargestThumb(api, message);
  } catch {
    return null;
  }
}

function isAnimatedDoc(message: unknown): boolean {
  const doc = (message as { document?: { attributes?: unknown } } | null)
    ?.document;
  const attributes = doc?.attributes;
  return (
    Array.isArray(attributes) &&
    attributes.some(
      (attr) =>
        (attr as { className?: unknown } | null)?.className ===
        "DocumentAttributeAnimated",
    )
  );
}

/**
 * A resolver over the session's live ref maps (which ingest mutates in
 * place, so the resolver always sees the latest refs).
 */
export function createTelegramMediaResolver(
  client: TelegramClient,
  refs: MediaRefs,
  peers: PeerRefs,
  messages: HitRefs,
): MediaResolver {
  return {
    async avatarBlob(peerId) {
      const entity = peers.get(peerId);
      if (!entity) return null;
      try {
        const api = client as unknown as DownloaderClient;
        return toStoredBlob(
          await api.downloadProfilePhoto(entity, { isBig: false }),
          "image/jpeg",
          false,
        );
      } catch {
        return null;
      }
    },

    async mediaPreviewBlob(mediaId, viaMessageId) {
      let ref = refs.get(mediaId);
      let blob = ref ? await downloadPreviewBlob(client, ref) : null;
      if (!blob && viaMessageId) {
        debug(
          `media ${mediaId}: ${ref ? "download failed" : "no ref"}, recovering via ${viaMessageId}`,
        );
        ref = await refreshMessageRef(client, peers, viaMessageId);
        blob = ref ? await downloadPreviewBlob(client, ref) : null;
      }
      if (!blob) {
        debug(
          `media ${mediaId}: unresolvable (ref=${ref ? "yes" : "no"}, via=${viaMessageId ?? "none"})`,
        );
      }
      return blob;
    },

    async hitPreviewBlob(messageId) {
      const ref =
        messages.get(messageId) ??
        (await refreshMessageRef(client, peers, messageId));
      if (!ref) return null;

      // Photos download in full, gifs/video-stickers play, but plain videos —
      // which can be huge — show their largest thumbnail frame instead.
      const mime = mimeOf(ref);
      if (mime?.startsWith("video/") && !isAnimatedDoc(ref)) {
        try {
          const api = client as unknown as DownloaderClient;
          return await downloadLargestThumb(api, ref);
        } catch {
          return null;
        }
      }
      return downloadPreviewBlob(client, ref);
    },
  };
}
