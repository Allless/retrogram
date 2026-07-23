import type { FunctionComponent } from "preact";

import type { Dataset } from "../model/types";
import { defineStat } from "./registry";
import { hourOfWeek } from "./shared/time";

const HOURS_PER_DAY = 24;
const DAYS_PER_WEEK = 7;
const SLOT_COUNT = HOURS_PER_DAY * DAYS_PER_WEEK; // 168

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export interface ActivityHeatmapResult {
  slots: number[]; // length 168, index = weekday * 24 + hour (weekday 0 = Monday)
  busiestSlot: { weekday: number; hour: number; count: number };
  peakHour: number; // 0–23, hour-of-day with the most messages across all days
  peakWeekday: number; // 0–6, weekday with the most messages across all hours
}

function argmax(values: number[]): number {
  let best = 0;
  for (let i = 1; i < values.length; i++) {
    if (values[i] > values[best]) best = i;
  }
  return best;
}

function compute(dataset: Dataset): ActivityHeatmapResult {
  const tz = dataset.meta.timezone;
  const slots = new Array<number>(SLOT_COUNT).fill(0);

  for (const message of dataset.messages) {
    slots[hourOfWeek(message.timestamp, tz)]++;
  }

  const busiestIndex = argmax(slots);
  const busiestSlot = {
    weekday: Math.floor(busiestIndex / HOURS_PER_DAY),
    hour: busiestIndex % HOURS_PER_DAY,
    count: slots[busiestIndex],
  };

  const byHour = new Array<number>(HOURS_PER_DAY).fill(0);
  const byWeekday = new Array<number>(DAYS_PER_WEEK).fill(0);
  for (let i = 0; i < SLOT_COUNT; i++) {
    byHour[i % HOURS_PER_DAY] += slots[i];
    byWeekday[Math.floor(i / HOURS_PER_DAY)] += slots[i];
  }

  return {
    slots,
    busiestSlot,
    peakHour: argmax(byHour),
    peakWeekday: argmax(byWeekday),
  };
}

const Card: FunctionComponent<{ result: ActivityHeatmapResult }> = ({
  result,
}) => {
  const max = result.busiestSlot.count;

  return (
    <div class="stat-heatmap">
      <div class="stat-heatmap__grid">
        {Array.from({ length: DAYS_PER_WEEK }, (_, weekday) => (
          <div class="stat-heatmap__row" key={weekday}>
            <span class="stat-heatmap__label">{WEEKDAY_LABELS[weekday]}</span>
            {Array.from({ length: HOURS_PER_DAY }, (_, hour) => {
              const count = result.slots[weekday * HOURS_PER_DAY + hour];
              const intensity = max > 0 ? count / max : 0;
              return (
                <span
                  class="stat-heatmap__cell"
                  key={hour}
                  title={`${WEEKDAY_LABELS[weekday]} ${hour}:00 — ${count}`}
                  style={{
                    backgroundColor: `color-mix(in srgb, var(--accent) ${Math.round(intensity * 100)}%, transparent)`,
                  }}
                />
              );
            })}
          </div>
        ))}
      </div>
      <p class="stat-heatmap__summary">
        {max > 0
          ? `Busiest: ${WEEKDAY_LABELS[result.busiestSlot.weekday]} around ${result.busiestSlot.hour}:00`
          : "No activity yet"}
      </p>
    </div>
  );
};

export const activityHeatmap = defineStat<ActivityHeatmapResult>({
  id: "activity-heatmap",
  title: "Activity heatmap",
  description: "Your busiest hours of the day and days of the week.",
  compute,
  Card,
});
