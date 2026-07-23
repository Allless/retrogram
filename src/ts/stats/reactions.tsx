/**
 * Most-used emoji reactions, split by who reacted. Telegram marks the current
 * account's picks with `chosenOrder` (captured as `reaction.you` at ingest),
 * so "yours" is exact everywhere; the remainder is everyone else — your DM
 * partners, or reactions your group posts collect.
 */

import type { FunctionComponent } from "preact";

import { defineStat } from "./registry";
import type { Dataset } from "../model/types";

export interface ReactionCount {
  emoji: string;
  count: number;
}

export interface ReactionsResult {
  given: ReactionCount[]; // reactions you picked
  received: ReactionCount[]; // reactions everyone else left
}

const TOP_REACTIONS = 12;

function topOf(counts: Map<string, number>): ReactionCount[] {
  return (
    [...counts.entries()]
      .map(([emoji, count]) => ({ emoji, count }))
      // Count desc, then emoji asc for deterministic ties.
      .sort((a, b) => b.count - a.count || (a.emoji < b.emoji ? -1 : 1))
      .slice(0, TOP_REACTIONS)
  );
}

function compute(dataset: Dataset): ReactionsResult {
  const given = new Map<string, number>();
  const received = new Map<string, number>();

  for (const message of dataset.messages) {
    for (const reaction of message.reactions ?? []) {
      if (reaction.you) {
        given.set(reaction.emoticon, (given.get(reaction.emoticon) ?? 0) + 1);
      }
      const others = reaction.count - (reaction.you ? 1 : 0);
      if (others > 0) {
        received.set(
          reaction.emoticon,
          (received.get(reaction.emoticon) ?? 0) + others,
        );
      }
    }
  }

  return { given: topOf(given), received: topOf(received) };
}

const ReactionRow: FunctionComponent<{
  heading: string;
  reactions: ReactionCount[];
}> = ({ heading, reactions }) =>
  reactions.length === 0 ? null : (
    <div class="response-section">
      <h4>{heading}</h4>
      <ul class="emoji-row">
        {reactions.map(({ emoji, count }) => (
          <li key={emoji} class="emoji-item" title={`${count}×`}>
            <span class="emoji-glyph">{emoji}</span>
            <span class="emoji-count">{count}</span>
          </li>
        ))}
      </ul>
    </div>
  );

const Card: FunctionComponent<{ result: ReactionsResult }> = ({ result }) => {
  if (result.given.length === 0 && result.received.length === 0) {
    return <p class="muted">No reactions yet.</p>;
  }
  return (
    <div class="response-times">
      <ReactionRow heading="You react with" reactions={result.given} />
      <ReactionRow heading="You get back" reactions={result.received} />
    </div>
  );
};

export const reactions = defineStat<ReactionsResult>({
  id: "reactions",
  title: "Reactions",
  description: "The emoji you react with — and the ones you get back.",
  compute,
  Card,
});
