/**
 * Cache-first media previews, platform-blind. Blobs are served from the
 * persisted IndexedDB store — so a cache-restored session still renders
 * anything downloaded before — and fetched through the platform's
 * `MediaResolver` on miss, persisting for future sessions.
 */

import { loadBlob, saveBlob, type StoredBlob } from "../store/datasetCache";

export interface MediaPreview {
  url: string;
  /** True when the url holds a video (mp4 gif / webm sticker) for <video>. */
  video: boolean;
}

/** A platform's live media fetching; every method may resolve null. */
export interface MediaResolver {
  avatarBlob(peerId: string): Promise<StoredBlob | null>;
  mediaPreviewBlob(
    mediaId: string,
    viaMessageId?: string,
  ): Promise<StoredBlob | null>;
  hitPreviewBlob(messageId: string): Promise<StoredBlob | null>;
}

function urlOf(blob: StoredBlob): string {
  return URL.createObjectURL(new Blob([blob.bytes], { type: blob.type }));
}

async function cacheFirst(
  key: string,
  fetchBlob: (() => Promise<StoredBlob | null>) | null,
): Promise<StoredBlob | null> {
  const cached = await loadBlob(key);
  if (cached) return cached;
  const blob = (await fetchBlob?.()) ?? null;
  if (blob) void saveBlob(key, blob);
  return blob;
}

/** Preview for a reacted media message ("Greatest hits"). */
export async function getHitPreview(
  media: MediaResolver | null,
  messageId: string,
): Promise<MediaPreview | null> {
  const blob = await cacheFirst(
    `hit:${messageId}`,
    media && (() => media.hitPreviewBlob(messageId)),
  );
  return blob ? { url: urlOf(blob), video: blob.video } : null;
}

/** Preview for a sticker/gif document. */
export async function getMediaPreview(
  media: MediaResolver | null,
  mediaId: string,
  viaMessageId?: string,
): Promise<MediaPreview | null> {
  const blob = await cacheFirst(
    `media:${mediaId}`,
    media && (() => media.mediaPreviewBlob(mediaId, viaMessageId)),
  );
  return blob ? { url: urlOf(blob), video: blob.video } : null;
}

/** Profile-photo object URL for a peer, or null when unavailable. */
export async function getAvatarUrl(
  media: MediaResolver | null,
  peerId: string,
): Promise<string | null> {
  const blob = await cacheFirst(
    `avatar:${peerId}`,
    media && (() => media.avatarBlob(peerId)),
  );
  return blob ? urlOf(blob) : null;
}
