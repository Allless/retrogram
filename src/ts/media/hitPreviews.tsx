/**
 * Media previews for "Greatest hits" — same context pattern as avatars: the
 * dashboard provides a resolver (blob-cache first, live download second), and
 * the pure stat card just renders `<HitMedia>`. Falls back to the given
 * children when no preview exists (cache-restored session without the blob).
 */

import { createContext } from "preact";
import { useContext, useEffect } from "preact/hooks";

import type { ComponentChildren } from "preact";
import type { MediaPreview } from "./downloadMedia";

export interface HitPreviewSource {
  /** Ask for a message's media preview; a no-op without a live client. */
  request: (messageId: string) => void;
  /** messageId → preview, null when unavailable. */
  previews: Record<string, MediaPreview | null>;
}

export const HitPreviewContext = createContext<HitPreviewSource>({
  request: () => undefined,
  previews: {},
});

export function HitMedia({
  messageId,
  fallback,
}: {
  messageId: string;
  fallback?: ComponentChildren;
}) {
  const { request, previews } = useContext(HitPreviewContext);
  useEffect(() => request(messageId), [messageId, request]);

  const preview = previews[messageId];
  if (!preview) return <>{fallback ?? null}</>;
  return preview.video ? (
    <video
      class="hit-media"
      src={preview.url}
      autoplay
      loop
      muted
      playsinline
    />
  ) : (
    <img class="hit-media" src={preview.url} alt="" loading="lazy" />
  );
}
