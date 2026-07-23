/**
 * Opt-in thumbnail embedding for shares. Downscales already-downloaded media
 * (blob store / live refs) to JPEG data URIs so a viewer with no Telegram
 * access still sees images; video previews (mp4 gifs, webm stickers)
 * contribute their first frame.
 *
 * Sizing is dynamic: a shared byte budget — sized to keep the encrypted
 * payload under Telegraph's 64KB page cap — is split by weight (Greatest
 * hits get 3× a sticker/GIF's share) against the REMAINING budget, so slack
 * from small images flows to later ones. Each thumb renders at the largest
 * dimensions that fit its allocation.
 */

import { debug } from "../debug";
import { getHitPreview, getMediaPreview } from "../media/downloadMedia";

import type { MediaContext, MediaPreview } from "../media/downloadMedia";
import type { SharedSummary, ThumbSources } from "./summary";

/**
 * Max total data-URI characters across all embedded thumbnails. Encryption +
 * base64 inflate the JSON by ~4/3, so ~40KB thumbs + a few KB of stats ≈ 59KB,
 * under Telegraph's 64KB page cap (and the 60K upload guard).
 */
const THUMB_BUDGET = 40_000;

// Hits are real photos/video frames; stickers and GIFs are small, simple
// images — weight the budget split and cap dimensions accordingly.
const HIT_WEIGHT = 3;
const MEDIA_WEIGHT = 1;
const HIT_MAX_PX = 320;
const MEDIA_MAX_PX = 160;

const MIN_PX = 48; // below this a thumb is useless — give up instead
const MIN_ALLOC = 1_000; // chars; don't bother rendering into less
const RENDER_ATTEMPTS = 5;
const JPEG_QUALITY = 0.6;
// JPEG headers + data-URI prefix are a fixed floor that doesn't shrink with
// pixel area — subtract it when estimating how far to scale down.
const FIXED_OVERHEAD = 800;

/**
 * First decoded frame of a video blob, ready to draw onto a canvas. Seeks a
 * hair forward — several encoders don't decode a paintable frame until the
 * first seek — and times out rather than hanging the whole share build on one
 * broken file.
 */
function videoFrame(url: string): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    const timer = setTimeout(
      () => reject(new Error("video frame timeout")),
      4000,
    );
    const settle = () => {
      clearTimeout(timer);
      if (video.videoWidth > 0 && video.readyState >= 2) {
        resolve(video);
      } else {
        reject(new Error("no decodable frame"));
      }
    };
    video.muted = true;
    video.preload = "auto";
    video.onseeked = settle;
    video.onloadeddata = () => {
      try {
        video.currentTime = 0.01;
      } catch {
        settle();
      }
    };
    video.onerror = () => {
      clearTimeout(timer);
      reject(new Error("video load failed"));
    };
    video.src = url;
  });
}

interface DrawableSource {
  source: CanvasImageSource;
  width: number;
  height: number;
}

async function loadSource(preview: MediaPreview): Promise<DrawableSource> {
  if (preview.video) {
    const video = await videoFrame(preview.url);
    return {
      source: video,
      width: video.videoWidth,
      height: video.videoHeight,
    };
  }
  const blob = await (await fetch(preview.url)).blob();
  const bitmap = await createImageBitmap(blob);
  return { source: bitmap, width: bitmap.width, height: bitmap.height };
}

async function renderAt(
  drawable: DrawableSource,
  px: number,
): Promise<string | null> {
  const scale = Math.min(1, px / Math.max(drawable.width, drawable.height));
  const canvas = new OffscreenCanvas(
    Math.max(1, Math.round(drawable.width * scale)),
    Math.max(1, Math.round(drawable.height * scale)),
  );
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(drawable.source, 0, 0, canvas.width, canvas.height);
  const out = await canvas.convertToBlob({
    type: "image/jpeg",
    quality: JPEG_QUALITY,
  });
  const bytes = new Uint8Array(await out.arrayBuffer());
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return `data:image/jpeg;base64,${btoa(binary)}`;
}

/**
 * Largest rendering of the preview that fits `alloc` characters: render,
 * measure, and shrink by sqrt(alloc/actual) until it fits (JPEG size scales
 * roughly with pixel area).
 */
async function toThumbWithin(
  preview: MediaPreview,
  maxPx: number,
  alloc: number,
): Promise<string | null> {
  try {
    const drawable = await loadSource(preview);
    let px = Math.min(maxPx, Math.max(drawable.width, drawable.height));
    for (let attempt = 0; attempt < RENDER_ATTEMPTS; attempt++) {
      const uri = await renderAt(drawable, px);
      if (!uri) return null;
      if (uri.length <= alloc) return uri;
      debug("thumb over alloc", { px, size: uri.length, alloc });
      // Scale by the compressible portion only — the fixed overhead never
      // shrinks, so naive sqrt(alloc/size) converges too slowly and stalls
      // a few chars above the allocation.
      const targetBody = Math.max(alloc - FIXED_OVERHEAD, 200);
      const actualBody = Math.max(uri.length - FIXED_OVERHEAD, 300);
      px = Math.min(
        px - 1,
        Math.floor(px * Math.sqrt(targetBody / actualBody) * 0.95),
      );
      if (px < MIN_PX) {
        debug("thumb gave up: below MIN_PX");
        return null;
      }
    }
    debug("thumb gave up: attempts exhausted");
    return null;
  } catch (err) {
    debug("thumb render failed", err instanceof Error ? err.message : err);
    return null;
  }
}

interface ThumbJob {
  resolve: () => Promise<MediaPreview | null>;
  assign: (thumb: string) => void;
  weight: number;
  maxPx: number;
  label: string;
}

/** Interleave group members: a1, b1, c1, a2, b2, … — fair budget order. */
function interleave(groups: ThumbJob[][]): ThumbJob[] {
  const queue: ThumbJob[] = [];
  for (let i = 0; ; i++) {
    let pushed = false;
    for (const group of groups) {
      const job = group[i];
      if (job) {
        queue.push(job);
        pushed = true;
      }
    }
    if (!pushed) return queue;
  }
}

/** Mutates `summary`, filling `thumb` fields from the aligned sources. */
export async function embedThumbs(
  summary: SharedSummary,
  sources: ThumbSources,
  media: MediaContext | null,
  onProgress?: (done: number, total: number) => void,
): Promise<void> {
  const hitJobs: ThumbJob[] = [];
  for (const [i, messageId] of sources.hits.entries()) {
    const hit = summary.hits?.[i];
    if (!messageId || !hit) continue;
    hitJobs.push({
      resolve: () => getHitPreview(media, messageId),
      assign: (thumb) => {
        hit.thumb = thumb;
      },
      weight: HIT_WEIGHT,
      maxPx: HIT_MAX_PX,
      label: `hit ${i}`,
    });
  }

  const mediaJobs = (
    kind: string,
    ids: ThumbSources["stickers"],
    targets?: { thumb?: string }[],
  ) =>
    ids.flatMap((source, i) => {
      const target = targets?.[i];
      if (!target) return [];
      return [
        {
          resolve: () =>
            getMediaPreview(media, source.mediaId, source.viaMessageId),
          assign: (thumb: string) => {
            target.thumb = thumb;
          },
          weight: MEDIA_WEIGHT,
          maxPx: MEDIA_MAX_PX,
          label: `${kind} ${i}`,
        },
      ];
    });

  const queue = interleave([
    hitJobs,
    mediaJobs("sticker", sources.stickers, summary.stickerTop),
    mediaJobs("gif", sources.gifs, summary.gifTop),
  ]);

  // Kick off all downloads concurrently (they dominate the wait); spend the
  // byte budget in queue order so the split is deterministic.
  const downloads = queue.map((job) =>
    job.resolve().catch(() => null as MediaPreview | null),
  );
  const previews: (MediaPreview | null)[] = [];

  try {
    // Pass 1: allocate from the remaining budget by weight — slack from
    // small images flows forward to later ones.
    let budget = THUMB_BUDGET;
    let weightLeft = queue.reduce((sum, job) => sum + job.weight, 0);
    const failed: number[] = [];
    for (const [i, job] of queue.entries()) {
      const alloc = Math.floor((budget * job.weight) / weightLeft);
      weightLeft -= job.weight;
      const preview = await downloads[i];
      previews[i] = preview;
      onProgress?.(i + 1, queue.length);
      if (!preview) {
        debug(`thumb job ${i} (${job.label}): no preview resolvable`);
        continue;
      }
      if (alloc < MIN_ALLOC) {
        debug(`thumb job ${i} (${job.label}): alloc ${alloc} below minimum`);
        failed.push(i);
        continue;
      }
      const thumb = await toThumbWithin(preview, job.maxPx, alloc);
      if (thumb) {
        budget -= thumb.length;
        job.assign(thumb);
        debug(`thumb job ${i} (${job.label}): embedded ${thumb.length} chars`);
      } else {
        failed.push(i);
      }
    }

    // Pass 2: the queue-order split shortchanges early items (they see the
    // least accumulated slack) — hand whatever budget remains to the ones
    // that didn't fit.
    let failWeight = failed.reduce((sum, i) => sum + queue[i].weight, 0);
    for (const i of failed) {
      const job = queue[i];
      const preview = previews[i];
      const alloc = Math.floor((budget * job.weight) / failWeight);
      failWeight -= job.weight;
      if (!preview || alloc < MIN_ALLOC) continue;
      const thumb = await toThumbWithin(preview, job.maxPx, alloc);
      if (thumb) {
        budget -= thumb.length;
        job.assign(thumb);
        debug(
          `thumb job ${i} (${job.label}): embedded ${thumb.length} chars on retry`,
        );
      } else {
        debug(`thumb job ${i} (${job.label}): failed even on retry`);
      }
    }
  } finally {
    for (const preview of previews) {
      if (preview) URL.revokeObjectURL(preview.url);
    }
  }
}
