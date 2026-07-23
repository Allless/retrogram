/**
 * Cache-first previews for stickers/gifs and profile photos. Telegram file
 * references only live for the session that ingested them, so every download
 * is persisted as bytes in IndexedDB — a cache-restored session (no refs)
 * still renders anything downloaded before. Gifs (mp4) and video stickers
 * (webm) download in full and render in a looping <video>; animated lottie
 * stickers (.tgs) fall back to their largest static thumbnail.
 *
 * The gramjs client and message are typed structurally (a single documented
 * cast), mirroring `ingest.ts`, to avoid depending on gramjs' internal types.
 */

import type { TelegramClient } from "telegram";

import { debug } from "../debug";
import { loadBlob, saveBlob, type StoredBlob } from "../store/datasetCache";
import type { HitRefs, MediaRefs, PeerRefs } from "../ingestion/ingest";

export interface MediaContext {
  client: TelegramClient;
  refs: MediaRefs;
  peers: PeerRefs;
  messages: HitRefs;
}

export interface MediaPreview {
  url: string;
  /** True when the url holds a video (mp4 gif / webm sticker) for <video>. */
  video: boolean;
}

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
  media: MediaContext,
  messageId: string,
): Promise<unknown | null> {
  const parts = messageId.split(":");
  const id = Number(parts.pop());
  const entity = media.peers.get(parts.join(":"));
  if (!entity || !Number.isFinite(id)) return null;
  try {
    const api = media.client as unknown as DownloaderClient;
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

function urlOf(blob: StoredBlob): string {
  return URL.createObjectURL(new Blob([blob.bytes], { type: blob.type }));
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
 * Preview for a reacted media message ("Greatest hits"): photos download in
 * full, gifs/video-stickers play, but plain videos — which can be huge — show
 * their largest thumbnail frame instead. Cache-first like everything else.
 */
export async function getHitPreview(
  media: MediaContext | null,
  messageId: string,
): Promise<MediaPreview | null> {
  const key = `hit:${messageId}`;
  const cached = await loadBlob(key);
  if (cached) return { url: urlOf(cached), video: cached.video };

  if (!media) return null;
  const ref =
    media.messages.get(messageId) ??
    (await refreshMessageRef(media, messageId));
  if (!ref) return null;

  const mime = mimeOf(ref);
  let blob: StoredBlob | null;
  if (mime?.startsWith("video/") && !isAnimatedDoc(ref)) {
    try {
      const api = media.client as unknown as DownloaderClient;
      blob = await downloadLargestThumb(api, ref);
    } catch {
      blob = null;
    }
  } else {
    blob = await downloadPreviewBlob(media.client, ref);
  }
  if (!blob) return null;
  void saveBlob(key, blob);
  return { url: urlOf(blob), video: blob.video };
}

/**
 * Preview for a sticker/gif document: the persisted blob if one exists, else
 * a live download (persisted for future sessions). When the session-only ref
 * map has no entry — cache-restored session, or the download failed on an
 * expired reference — `viaMessageId` re-fetches that message for a fresh ref.
 */
export async function getMediaPreview(
  media: MediaContext | null,
  mediaId: string,
  viaMessageId?: string,
): Promise<MediaPreview | null> {
  const key = `media:${mediaId}`;
  const cached = await loadBlob(key);
  if (cached) return { url: urlOf(cached), video: cached.video };
  if (!media) return null;

  let ref = media.refs.get(mediaId);
  let blob = ref ? await downloadPreviewBlob(media.client, ref) : null;
  if (!blob && viaMessageId) {
    debug(
      `media ${mediaId}: ${ref ? "download failed" : "no ref"}, recovering via ${viaMessageId}`,
    );
    ref = await refreshMessageRef(media, viaMessageId);
    blob = ref ? await downloadPreviewBlob(media.client, ref) : null;
  }
  if (!blob) {
    debug(
      `media ${mediaId}: unresolvable (ref=${ref ? "yes" : "no"}, via=${viaMessageId ?? "none"})`,
    );
    return null;
  }
  void saveBlob(key, blob);
  return { url: urlOf(blob), video: blob.video };
}

/**
 * Profile-photo object URL for a peer: the persisted blob if one exists, else
 * a live download (persisted for future sessions).
 */
export async function getAvatarUrl(
  media: MediaContext | null,
  peerId: string,
): Promise<string | null> {
  const key = `avatar:${peerId}`;
  const cached = await loadBlob(key);
  if (cached) return urlOf(cached);

  const entity = media?.peers.get(peerId);
  if (!media || !entity) return null;
  try {
    const api = media.client as unknown as DownloaderClient;
    const blob = toStoredBlob(
      await api.downloadProfilePhoto(entity, { isBig: false }),
      "image/jpeg",
      false,
    );
    if (!blob) return null;
    void saveBlob(key, blob);
    return urlOf(blob);
  } catch {
    return null;
  }
}
