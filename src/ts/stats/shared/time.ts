/**
 * Timezone-aware date bucketing, shared by every time-series stat so they all
 * bucket identically. All functions take an IANA `tz` (from `dataset.meta.timezone`)
 * and use `Intl.DateTimeFormat` rather than the host locale, so results are stable
 * regardless of where the code runs.
 */

import type { Message } from "../../model/types";

interface ZonedParts {
  year: number;
  month: number; // 1–12
  day: number; // 1–31
  hour: number; // 0–23
  weekday: number; // 0 = Monday … 6 = Sunday
}

const WEEKDAY_INDEX: Record<string, number> = {
  Mon: 0,
  Tue: 1,
  Wed: 2,
  Thu: 3,
  Fri: 4,
  Sat: 5,
  Sun: 6,
};

function zonedParts(ts: number, tz: string): ZonedParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
    weekday: "short",
  }).formatToParts(new Date(ts));

  const lookup = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((p) => p.type === type)?.value ?? "";

  // Intl may render midnight as hour "24"; normalize to 0.
  const hour = Number(lookup("hour")) % 24;

  return {
    year: Number(lookup("year")),
    month: Number(lookup("month")),
    day: Number(lookup("day")),
    hour,
    weekday: WEEKDAY_INDEX[lookup("weekday")] ?? 0,
  };
}

const pad = (n: number): string => String(n).padStart(2, "0");

/** Slot 0–167: `weekday * 24 + hour`, with weekday 0 = Monday. */
export function hourOfWeek(ts: number, tz: string): number {
  const { weekday, hour } = zonedParts(ts, tz);
  return weekday * 24 + hour;
}

/** Local calendar day as "YYYY-MM-DD" in `tz`. */
export function dayKey(ts: number, tz: string): string {
  const { year, month, day } = zonedParts(ts, tz);
  return `${year}-${pad(month)}-${pad(day)}`;
}

/** Local month as "YYYY-MM" in `tz`. */
export function monthKey(ts: number, tz: string): string {
  const { year, month } = zonedParts(ts, tz);
  return `${year}-${pad(month)}`;
}

/**
 * Week bucket keyed by the "YYYY-MM-DD" of that week's Monday (in `tz`).
 * Derived from the day key so it inherits the same zoned calendar.
 */
export function weekKey(ts: number, tz: string): string {
  const { weekday } = zonedParts(ts, tz);
  const mondayTs = ts - weekday * 24 * 60 * 60 * 1000;
  return dayKey(mondayTs, tz);
}

function bucketBy(
  messages: Message[],
  keyOf: (ts: number) => string,
): Map<string, Message[]> {
  const buckets = new Map<string, Message[]>();
  for (const message of messages) {
    const key = keyOf(message.timestamp);
    const existing = buckets.get(key);
    if (existing) {
      existing.push(message);
    } else {
      buckets.set(key, [message]);
    }
  }
  return buckets;
}

export function bucketByDay(
  messages: Message[],
  tz: string,
): Map<string, Message[]> {
  return bucketBy(messages, (ts) => dayKey(ts, tz));
}

export function bucketByWeek(
  messages: Message[],
  tz: string,
): Map<string, Message[]> {
  return bucketBy(messages, (ts) => weekKey(ts, tz));
}

export function bucketByMonth(
  messages: Message[],
  tz: string,
): Map<string, Message[]> {
  return bucketBy(messages, (ts) => monthKey(ts, tz));
}
