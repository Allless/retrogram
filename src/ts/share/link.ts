/**
 * Share-link fragment encoding. Two forms, both living entirely in the URL
 * fragment (never sent to any server):
 *
 *   #s=<telegraph-path>!<key>   — ciphertext hosted on telegra.ph
 *   #d=<compressed summary>     — self-contained fallback, no hosting at all
 *
 * The inline form deflates the JSON when CompressionStream is available and
 * marks the payload with a leading "1"/"0" so decoding knows which it got.
 */

import { fromBase64Url, toBase64Url } from "./crypto";

export type ShareRef =
  | { kind: "telegraph"; path: string; key: string }
  | { kind: "inline"; data: string };

export function buildShareHash(ref: ShareRef): string {
  return ref.kind === "telegraph"
    ? `#s=${ref.path}!${ref.key}`
    : `#d=${ref.data}`;
}

export function parseShareHash(hash: string): ShareRef | null {
  const telegraph = /^#s=([A-Za-z0-9-]+)!([A-Za-z0-9_-]+)$/.exec(hash);
  if (telegraph) {
    return { kind: "telegraph", path: telegraph[1], key: telegraph[2] };
  }
  const inline = /^#d=([01][A-Za-z0-9_-]*)$/.exec(hash);
  if (inline) {
    return { kind: "inline", data: inline[1] };
  }
  return null;
}

async function pipeThrough(
  bytes: Uint8Array,
  transform: ReadableWritablePair<Uint8Array, BufferSource>,
): Promise<Uint8Array> {
  const stream = new Blob([new Uint8Array(bytes)])
    .stream()
    .pipeThrough(transform);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** UTF-8 text → "1" + deflated base64url (or "0" + raw when unsupported). */
export async function deflateText(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  if (typeof CompressionStream === "undefined") {
    return `0${toBase64Url(bytes)}`;
  }
  const deflated = await pipeThrough(
    bytes,
    new CompressionStream("deflate-raw"),
  );
  return `1${toBase64Url(deflated)}`;
}

/** Inverse of `deflateText`. */
export async function inflateText(data: string): Promise<string> {
  const bytes = fromBase64Url(data.slice(1));
  if (data.startsWith("0")) {
    return new TextDecoder().decode(bytes);
  }
  const inflated = await pipeThrough(
    bytes,
    new DecompressionStream("deflate-raw"),
  );
  return new TextDecoder().decode(inflated);
}
