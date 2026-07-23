import type { FunctionComponent } from "preact";

import { bucketByMonth } from "./shared/time";
import { formatMonth } from "./shared/formatDate";
import { defineStat } from "./registry";
import type { Dataset } from "../model/types";

export interface MonthlyVolume {
  period: string; // "YYYY-MM"
  sent: number;
  received: number;
  total: number;
}

export interface VolumeOverTimeResult {
  monthly: MonthlyVolume[];
  totalSent: number;
  totalReceived: number;
}

function compute(dataset: Dataset): VolumeOverTimeResult {
  // Groups/channels only contain your own messages (ingestion filters them to
  // "me"), so counting them would skew the sent/received picture — DMs only.
  const dmMessages = dataset.messages.filter((message) => {
    const type = dataset.chats[message.chatId]?.type;
    return type === undefined || type === "private";
  });
  const buckets = bucketByMonth(dmMessages, dataset.meta.timezone);

  const monthly = [...buckets.entries()]
    .map(([period, messages]) => {
      const sent = messages.filter((m) => m.direction === "sent").length;
      const received = messages.length - sent;
      return {
        period,
        sent,
        received,
        total: messages.length,
      } satisfies MonthlyVolume;
    })
    .sort((a, b) => a.period.localeCompare(b.period));

  const totalSent = monthly.reduce((sum, m) => sum + m.sent, 0);
  const totalReceived = monthly.reduce((sum, m) => sum + m.received, 0);

  return { monthly, totalSent, totalReceived };
}

const Card: FunctionComponent<{ result: VolumeOverTimeResult }> = ({
  result,
}) => {
  const peak = result.monthly.reduce((max, m) => Math.max(max, m.total), 0);

  return (
    <div class="volume">
      <p class="stat-summary">
        {result.totalSent.toLocaleString()} sent ·{" "}
        {result.totalReceived.toLocaleString()} received
      </p>
      <ul class="volume-bars">
        {result.monthly.map((m) => (
          <li class="volume-row" key={m.period}>
            <span class="volume-label">{formatMonth(m.period)}</span>
            <span class="volume-track">
              <span
                class="volume-fill"
                style={{
                  width: peak === 0 ? "0%" : `${(m.total / peak) * 100}%`,
                }}
              />
            </span>
            <span class="volume-count muted">{m.total}</span>
          </li>
        ))}
      </ul>
    </div>
  );
};

export const volumeOverTime = defineStat<VolumeOverTimeResult>({
  id: "volume-over-time",
  title: "Message volume",
  description: "How many DM messages you sent and received each month.",
  compute,
  Card,
});
