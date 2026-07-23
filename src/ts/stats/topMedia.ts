/**
 * Pure ranking of the stickers or gifs YOU send most, by document occurrence.
 * Kept separate from the `StatModule` registry because rendering the results
 * needs a live client to download images — the counting itself, though, is
 * pure and testable from the normalized dataset.
 */

import type { Dataset, MediaType } from "../model/types";

export interface MediaCount {
  mediaId: string;
  count: number;
}

export function topMediaByType(
  dataset: Dataset,
  mediaType: MediaType,
  limit: number,
): MediaCount[] {
  const counts = new Map<string, number>();
  for (const message of dataset.messages) {
    // Only what you sent — otherwise other people's favorites rank in DMs.
    if (message.direction !== "sent") continue;
    if (message.mediaType === mediaType && message.mediaId) {
      counts.set(message.mediaId, (counts.get(message.mediaId) ?? 0) + 1);
    }
  }

  return (
    [...counts.entries()]
      .map(([mediaId, count]) => ({ mediaId, count }))
      // Count desc, id asc for deterministic ties.
      .sort((a, b) => b.count - a.count || (a.mediaId < b.mediaId ? -1 : 1))
      .slice(0, limit)
  );
}
