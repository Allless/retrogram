import type { FunctionComponent } from "preact";

import type { Dataset } from "../model/types";
import { tokenize } from "./shared/text";
import { defineStat } from "./registry";

export interface EmojiCount {
  emoji: string;
  count: number;
}

export interface EmojiFrequencyResult {
  topEmoji: EmojiCount[];
}

const TOP_EMOJI = 24;

function compute(dataset: Dataset): EmojiFrequencyResult {
  const counts = new Map<string, number>();
  for (const message of dataset.messages) {
    // Only your own messages — otherwise bots and busy chats dominate the list.
    if (message.direction !== "sent") continue;
    for (const glyph of tokenize(message.text).emoji) {
      counts.set(glyph, (counts.get(glyph) ?? 0) + 1);
    }
  }

  const topEmoji = [...counts.entries()]
    .map(([emoji, count]) => ({ emoji, count }))
    // Count desc, then emoji asc for deterministic ties.
    .sort((a, b) => b.count - a.count || (a.emoji < b.emoji ? -1 : 1))
    .slice(0, TOP_EMOJI);

  return { topEmoji };
}

const Card: FunctionComponent<{ result: EmojiFrequencyResult }> = ({
  result,
}) => {
  if (result.topEmoji.length === 0) {
    return <p class="muted">No emoji in your messages yet.</p>;
  }

  return (
    <ul class="emoji-row">
      {result.topEmoji.map(({ emoji, count }) => (
        <li key={emoji} class="emoji-item" title={`${count}×`}>
          <span class="emoji-glyph">{emoji}</span>
          <span class="emoji-count">{count}</span>
        </li>
      ))}
    </ul>
  );
};

export const emojiFrequency = defineStat<EmojiFrequencyResult>({
  id: "emoji-frequency",
  title: "Most-used emoji",
  description: "The emoji you send most across your messages.",
  compute,
  Card,
});
