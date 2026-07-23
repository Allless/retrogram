/**
 * Streaks & milestones: how consistently you message, expressed as consecutive
 * active calendar days. "Now" is always derived from `dataset.meta.fetchedAt`,
 * never the wall clock, so results are deterministic.
 */

import { dayKey } from "./shared/time";
import { defineStat } from "./registry";
import type { Dataset } from "../model/types";

export interface StreaksResult {
  longestStreakDays: number;
  currentStreakDays: number;
  activeDays: number;
  totalSpanDays: number;
  firstMessageTimestamp: number | null;
  lastMessageTimestamp: number | null;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Convert a "YYYY-MM-DD" key to an integer day number (days since the Unix
 * epoch) by treating the key as UTC midnight. Adjacency between day numbers is
 * therefore a pure calendar-day step and ignores DST — an acceptable
 * approximation for streak counting, since the day keys themselves already
 * respect the dataset timezone.
 */
function dayNumberFromKey(key: string): number {
  const [year, month, day] = key.split("-").map(Number);
  return Math.round(Date.UTC(year, month - 1, day) / MS_PER_DAY);
}

function compute(dataset: Dataset): StreaksResult {
  const { messages, meta } = dataset;

  if (messages.length === 0) {
    return {
      longestStreakDays: 0,
      currentStreakDays: 0,
      activeDays: 0,
      totalSpanDays: 0,
      firstMessageTimestamp: null,
      lastMessageTimestamp: null,
    };
  }

  const tz = meta.timezone;
  const activeDayNumbers = new Set<number>();
  let firstTs = messages[0].timestamp;
  let lastTs = messages[0].timestamp;

  for (const message of messages) {
    activeDayNumbers.add(dayNumberFromKey(dayKey(message.timestamp, tz)));
    if (message.timestamp < firstTs) firstTs = message.timestamp;
    if (message.timestamp > lastTs) lastTs = message.timestamp;
  }

  const sortedDays = [...activeDayNumbers].sort((a, b) => a - b);

  let longestStreakDays = 1;
  let run = 1;
  for (let i = 1; i < sortedDays.length; i++) {
    run = sortedDays[i] === sortedDays[i - 1] + 1 ? run + 1 : 1;
    if (run > longestStreakDays) longestStreakDays = run;
  }

  // Current streak: consecutive active days ending at the day of `fetchedAt`.
  // Zero if that day itself has no activity.
  let currentStreakDays = 0;
  let cursor = dayNumberFromKey(dayKey(meta.fetchedAt, tz));
  while (activeDayNumbers.has(cursor)) {
    currentStreakDays++;
    cursor--;
  }

  const firstDay = dayNumberFromKey(dayKey(firstTs, tz));
  const lastDay = dayNumberFromKey(dayKey(lastTs, tz));

  return {
    longestStreakDays,
    currentStreakDays,
    activeDays: activeDayNumbers.size,
    totalSpanDays: lastDay - firstDay + 1,
    firstMessageTimestamp: firstTs,
    lastMessageTimestamp: lastTs,
  };
}

function Card({ result }: { result: StreaksResult }) {
  return (
    <dl class="stat-figures">
      <div>
        <dt>Longest streak</dt>
        <dd>{result.longestStreakDays} days</dd>
      </div>
      <div>
        <dt>Current streak</dt>
        <dd>{result.currentStreakDays} days</dd>
      </div>
      <div>
        <dt>Active days</dt>
        <dd>{result.activeDays}</dd>
      </div>
      <div>
        <dt>Total span</dt>
        <dd>{result.totalSpanDays} days</dd>
      </div>
    </dl>
  );
}

export const streaks = defineStat<StreaksResult>({
  id: "streaks",
  title: "Streaks",
  description: "Your longest and current runs of consecutive active days.",
  compute,
  Card,
});
