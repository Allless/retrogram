/**
 * Opt-in thumbnail embedding for shares. Downscales already-downloaded media
 * (blob store / live refs) to WebP data URIs so a viewer with no Telegram
 * access still sees images; video previews (mp4 gifs, webm stickers)
 * contribute their first frame.
 *
 * Every thumbnail renders at its display size and at ONE shared quality —
 * the highest the whole set can afford inside the byte budget that keeps the
 * encrypted payload under Telegraph's page cap. Only if the quality floor
 * still overflows does the whole set scale down together, so a row never
 * comes out at mixed qualities or mixed sizes.
 */

import { debug } from "../debug";
import { getHitPreview, getMediaPreview } from "../media/downloadMedia";

import type { MediaResolver, MediaPreview } from "../media/downloadMedia";
import type { SharedSummary, ThumbSources } from "./summary";

/**
 * Max total data-URI characters across all embedded thumbnails. Encryption +
 * base64 inflate the JSON by ~4/3, so ~40KB thumbs + a few KB of stats ≈ 59KB,
 * under Telegraph's 64KB page cap (and the 60K upload guard).
 */
/** Fallback budget when the caller doesn't measure the room left for images. */
const THUMB_BUDGET = 28_000;

// Hits are real photos shown large; stickers and GIFs are small, simple
// images shown at ~72 CSS px. The caps encode that difference — a shared
// quality then applies to all of them.
const HIT_MAX_PX = 320;
const MEDIA_MAX_PX = 160;

const MIN_PX = 48; // below this a thumb is useless — give up instead
const RENDER_ATTEMPTS = 4;
/* Ceilings for the quality search, not fixed settings: the fitter takes the
 * highest quality that fits the allocation, so these only cap how good a
 * generously-funded thumbnail may get. */
const ENCODE_QUALITY = 0.85;
/** Floor for the quality search — below this the artefacts are worse than
 * the resolution loss would have been. */
const MIN_QUALITY = 0.2;
/** Refinement probes after the interpolated guess. Interpolation lands
 * close, so two are enough to converge. */
const QUALITY_PROBES = 2;
/** The quality that fit last time, reused as the seed: shares from one
 * account have similar images, so the first guess is usually the answer. */
let lastFittedQuality: number | null = null;
/** WebP is ~25–35% smaller than JPEG at the same perceived quality, which
 * buys resolution inside a fixed byte budget. Everything since Safari 14
 * can encode it; older engines silently produce PNG, so the first render
 * probes the result and the whole share falls back to JPEG. */
let encodeType: "image/webp" | "image/jpeg" = "image/webp";

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
  quality: number,
): Promise<string | null> {
  const scale = Math.min(1, px / Math.max(drawable.width, drawable.height));
  const canvas = new OffscreenCanvas(
    Math.max(1, Math.round(drawable.width * scale)),
    Math.max(1, Math.round(drawable.height * scale)),
  );
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(drawable.source, 0, 0, canvas.width, canvas.height);
  let out = await canvas.convertToBlob({ type: encodeType, quality });
  if (encodeType === "image/webp" && out.type !== "image/webp") {
    // The engine ignored the request (older Safari) — PNG would blow the
    // budget, so switch this share to JPEG and re-encode.
    debug("thumb encoder: webp unsupported, falling back to jpeg");
    encodeType = "image/jpeg";
    out = await canvas.convertToBlob({ type: encodeType, quality });
  }
  const bytes = new Uint8Array(await out.arrayBuffer());
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return `data:${out.type};base64,${btoa(binary)}`;
}

/**
 * Largest rendering of the preview that fits `alloc` characters: render,
 * measure, and shrink by sqrt(alloc/actual) until it fits (JPEG size scales
 * roughly with pixel area).
 */
/**
 * Render every thumbnail of a share at ONE shared quality: the highest that
 * keeps the whole set inside the budget. Per-image allocations looked fair
 * but weren't — a slice is fixed before the image is seen, so a cheap GIF
 * sat on budget a complex sticker needed, and rows came out at mixed
 * qualities. One quality for all is both simpler and visually consistent.
 *
 * Dimensions stay at each kind's display cap (hits are shown larger than
 * stickers); only if the quality floor still overflows does everything scale
 * down together.
 */
async function fitAll(
  items: { preview: MediaPreview; maxPx: number; label: string }[],
  budget: number,
): Promise<(string | null)[]> {
  if (items.length === 0) return [];
  const drawables = await Promise.all(
    items.map(async (item) => {
      try {
        return await loadSource(item.preview);
      } catch (err) {
        debug("thumb source failed", {
          label: item.label,
          error: err instanceof Error ? err.message : String(err),
        });
        return null;
      }
    }),
  );

  const renderAll = async (quality: number, scale: number) =>
    Promise.all(
      drawables.map(async (drawable, i) => {
        if (!drawable) return null;
        const px = Math.floor(
          Math.min(items[i].maxPx, Math.max(drawable.width, drawable.height)) *
            scale,
        );
        if (px < MIN_PX) return null;
        return renderAt(drawable, px, quality);
      }),
    );
  const total = (uris: (string | null)[]) =>
    uris.reduce((sum, uri) => sum + (uri?.length ?? 0), 0);

  let scale = 1;
  for (let shrink = 0; shrink < RENDER_ATTEMPTS; shrink++) {
    let low = MIN_QUALITY;
    let high = ENCODE_QUALITY;

    // The ceiling is worth trying first: when the budget is generous it ends
    // the search in one round, and it anchors the interpolation otherwise.
    const atCeiling = await renderAll(high, scale);
    const ceilingSize = total(atCeiling);
    if (ceilingSize <= budget) {
      lastFittedQuality = high;
      debug("thumbs fitted", {
        quality: high,
        scale: Number(scale.toFixed(2)),
        size: ceilingSize,
        budget,
        renders: 1,
      });
      return atCeiling;
    }

    const atFloor = await renderAll(low, scale);
    const floorSize = total(atFloor);
    if (floorSize > budget) {
      // Even the floor overflows: scale every thumbnail down together so the
      // set stays visually uniform, and try again.
      const next = Math.sqrt(budget / floorSize) * 0.95;
      debug("thumbs too big at min quality", {
        scale: Number(scale.toFixed(2)),
        sizeAtFloor: floorSize,
        budget,
        nextScale: Number((scale * next).toFixed(2)),
      });
      scale *= next;
      continue;
    }

    // Secant step: size moves smoothly with quality, so interpolating
    // between the two measurements lands far closer than halving would.
    let best = atFloor;
    let bestQuality = low;
    let renders = 2;
    let guess = lastFittedQuality ?? low;
    for (let probe = 0; probe <= QUALITY_PROBES; probe++) {
      const span = high - low;
      const interpolated =
        low +
        (span * (budget - floorSize)) / Math.max(ceilingSize - floorSize, 1);
      const q = Math.min(
        high - 0.01,
        Math.max(low + 0.01, probe === 0 ? guess : interpolated),
      );
      if (q <= low || q >= high) break;
      const uris = await renderAll(q, scale);
      renders += 1;
      if (total(uris) <= budget) {
        best = uris;
        bestQuality = q;
        low = q;
      } else {
        high = q;
      }
      guess = q;
    }
    lastFittedQuality = bestQuality;
    debug("thumbs fitted", {
      quality: Number(bestQuality.toFixed(2)),
      scale: Number(scale.toFixed(2)),
      size: total(best),
      budget,
      renders,
    });
    return best;
  }
  debug("thumbs gave up", { budget });
  return items.map(() => null);
}

interface ThumbJob {
  resolve: () => Promise<MediaPreview | null>;
  assign: (thumb: string) => void;
  maxPx: number;
  label: string;
}

/** Mutates `summary`, filling `thumb` fields from the aligned sources. */
export async function embedThumbs(
  summary: SharedSummary,
  sources: ThumbSources,
  media: MediaResolver | null,
  onProgress?: (done: number, total: number) => void,
  /** Characters available for images — what's left of the payload ceiling
   * after the structural sections. Defaults to a conservative constant. */
  budget: number = THUMB_BUDGET,
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
          maxPx: MEDIA_MAX_PX,
          label: `${kind} ${i}`,
        },
      ];
    });

  const jobs = [
    ...hitJobs,
    ...mediaJobs("sticker", sources.stickers, summary.stickerTop),
    ...mediaJobs("gif", sources.gifs, summary.gifTop),
  ];
  debug("thumb jobs", { jobs: jobs.map((job) => job.label), budget });

  // Downloads dominate the wait, so start them all at once.
  const previews = await Promise.all(
    jobs.map(async (job, i) => {
      try {
        const preview = await job.resolve();
        onProgress?.(i + 1, jobs.length);
        return preview;
      } catch (err) {
        debug(`thumb ${job.label}: download threw`, {
          error: err instanceof Error ? err.message : String(err),
        });
        return null;
      }
    }),
  );

  const items: {
    preview: MediaPreview;
    maxPx: number;
    label: string;
    job: ThumbJob;
  }[] = [];
  for (const [i, preview] of previews.entries()) {
    if (!preview) {
      // Expired file reference, an unsupported sticker format (.tgs), or a
      // codec the browser can't decode.
      debug(`thumb ${jobs[i].label}: no preview resolvable`);
      continue;
    }
    items.push({
      preview,
      maxPx: jobs[i].maxPx,
      label: jobs[i].label,
      job: jobs[i],
    });
  }

  try {
    const uris = await fitAll(
      items.map(({ preview, maxPx, label }) => ({ preview, maxPx, label })),
      budget,
    );
    for (const [i, uri] of uris.entries()) {
      if (!uri) {
        debug(`thumb ${items[i].label}: no thumbnail fitted`);
        continue;
      }
      items[i].job.assign(uri);
    }
  } finally {
    for (const preview of previews) {
      if (preview) URL.revokeObjectURL(preview.url);
    }
  }
}
