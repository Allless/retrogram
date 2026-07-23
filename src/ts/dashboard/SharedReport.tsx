import { activityHeatmap } from "../stats/activityHeatmap";
import { emojiFrequency } from "../stats/emojiFrequency";
import { reactions } from "../stats/reactions";
import { responseTimes } from "../stats/responseTimes";
import { streaks } from "../stats/streaks";
import { volumeOverTime } from "../stats/volumeOverTime";

import type { SharedSummary } from "../share/summary";

/**
 * Read-only view of a shared, anonymized summary — reuses the stat modules'
 * own Cards with results reconstructed from the payload. No login required:
 * this renders for anyone who opens a share link.
 */
export function SharedReport({
  summary,
  onMakeYourOwn,
}: {
  summary: SharedSummary;
  onMakeYourOwn: () => void;
}) {
  const monthCount = summary.volume.monthly.length;

  return (
    <section class="dashboard">
      <div class="dashboard-head">
        <h2>A shared Telegram year</h2>
        <button type="button" class="btn-primary" onClick={onMakeYourOwn}>
          Make your own ◀◀
        </button>
      </div>

      <p class="muted">
        Someone shared their Retrogram summary with you —{" "}
        {summary.messageCount.toLocaleString()} messages across {monthCount}{" "}
        months, anonymized: aggregate numbers only, no names, no message text.
      </p>

      <div class="stat-grid">
        <article class="stat-card">
          <header class="stat-card-head">
            <h3>Headline numbers</h3>
            <p class="muted">The year at a glance.</p>
          </header>
          <dl class="stat-figures">
            <div>
              <dt>Messages</dt>
              <dd>{summary.messageCount.toLocaleString()}</dd>
            </div>
            <div>
              <dt>Busiest DM</dt>
              <dd>{summary.topChatMessages.toLocaleString()} msgs</dd>
            </div>
            <div>
              <dt>Top message</dt>
              <dd>
                {summary.topHitReactions}×{" "}
                {summary.topHitEmoji.slice(0, 3).join("")}
              </dd>
            </div>
            <div>
              <dt>Longest streak</dt>
              <dd>{summary.streaks.longestStreakDays} days</dd>
            </div>
          </dl>
        </article>

        <article class="stat-card">
          <header class="stat-card-head">
            <h3>{volumeOverTime.title}</h3>
            <p class="muted">{volumeOverTime.description}</p>
          </header>
          <volumeOverTime.Card result={summary.volume} />
        </article>

        <article class="stat-card">
          <header class="stat-card-head">
            <h3>{activityHeatmap.title}</h3>
            <p class="muted">{activityHeatmap.description}</p>
          </header>
          <activityHeatmap.Card result={summary.heatmap} />
        </article>

        <article class="stat-card">
          <header class="stat-card-head">
            <h3>{responseTimes.title}</h3>
            <p class="muted">How fast they reply — medians only.</p>
          </header>
          <responseTimes.Card
            result={{
              yourMedianSeconds: summary.yourMedianSeconds,
              theirMedianSeconds: summary.theirMedianSeconds,
              perChat: [],
              theyGhost: [],
              youGhost: [],
            }}
          />
        </article>

        <article class="stat-card">
          <header class="stat-card-head">
            <h3>{emojiFrequency.title}</h3>
            <p class="muted">{emojiFrequency.description}</p>
          </header>
          <emojiFrequency.Card result={{ topEmoji: summary.topEmoji }} />
        </article>

        <article class="stat-card">
          <header class="stat-card-head">
            <h3>{reactions.title}</h3>
            <p class="muted">{reactions.description}</p>
          </header>
          <reactions.Card
            result={{
              given: summary.reactionsGiven,
              received: summary.reactionsReceived,
            }}
          />
        </article>

        <article class="stat-card">
          <header class="stat-card-head">
            <h3>{streaks.title}</h3>
            <p class="muted">{streaks.description}</p>
          </header>
          <streaks.Card result={summary.streaks} />
        </article>
      </div>
    </section>
  );
}
