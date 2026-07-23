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

import { loadBlob, saveBlob, type StoredBlob } from "../store/datasetCache";
import type { MediaRefs, PeerRefs } from "../ingestion/ingest";

export interface MediaContext {
  client: TelegramClient;
  refs: MediaRefs;
  peers: PeerRefs;
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

/**
 * Preview for a sticker/gif document: the persisted blob if one exists, else
 * a live download (persisted for future sessions). `null` when the bytes are
 * neither cached nor reachable (no live session or no ref).
 */
export async function getMediaPreview(
  media: MediaContext | null,
  mediaId: string,
): Promise<MediaPreview | null> {
  const key = `media:${mediaId}`;
  const cached = await loadBlob(key);
  if (cached) return { url: urlOf(cached), video: cached.video };

  const ref = media?.refs.get(mediaId);
  if (!media || !ref) return null;
  const blob = await downloadPreviewBlob(media.client, ref);
  if (!blob) return null;
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
