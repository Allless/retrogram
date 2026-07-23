import { useEffect, useState } from "preact/hooks";

import { topMediaByType } from "../stats/topMedia";
import { getMediaPreview } from "../media/downloadMedia";

import type { MediaContext, MediaPreview } from "../media/downloadMedia";
import type { Dataset, MediaType } from "../model/types";

const TOP = 20;

interface MediaStatProps {
  dataset: Dataset;
  media: MediaContext | null;
  mediaType: MediaType;
  emptyLabel: string;
}

/**
 * Ranks the top sticker/gif documents (pure) and resolves their previews —
 * from the persisted blob store or a live download — rendering images in an
 * <img> and mp4/webm clips in a looping <video>. A cache-restored session
 * shows whatever was downloaded before; anything else stays a placeholder.
 */
export function MediaStat({
  dataset,
  media,
  mediaType,
  emptyLabel,
}: MediaStatProps) {
  const items = topMediaByType(dataset, mediaType, TOP);
  const [previews, setPreviews] = useState<Record<string, MediaPreview | null>>(
    {},
  );

  useEffect(() => {
    let cancelled = false;
    const created: string[] = [];

    void (async () => {
      for (const { mediaId } of topMediaByType(dataset, mediaType, TOP)) {
        const preview = await getMediaPreview(media, mediaId);
        if (cancelled) {
          if (preview) URL.revokeObjectURL(preview.url);
          return;
        }
        if (preview) created.push(preview.url);
        setPreviews((prev) => ({ ...prev, [mediaId]: preview }));
      }
    })();

    return () => {
      cancelled = true;
      for (const url of created) URL.revokeObjectURL(url);
    };
  }, [dataset, media, mediaType]);

  if (items.length === 0) {
    return <p class="muted">{emptyLabel}</p>;
  }

  return (
    <ul class="media-grid">
      {items.map(({ mediaId, count }) => {
        const preview = previews[mediaId];
        return (
          <li key={mediaId} class="media-item">
            {preview ? (
              preview.video ? (
                <video
                  class="media-img"
                  src={preview.url}
                  autoplay
                  loop
                  muted
                  playsinline
                />
              ) : (
                <img
                  class="media-img"
                  src={preview.url}
                  alt=""
                  loading="lazy"
                />
              )
            ) : (
              <span class="media-placeholder" aria-hidden="true" />
            )}
            <span class="media-count muted">{count}×</span>
          </li>
        );
      })}
    </ul>
  );
}
