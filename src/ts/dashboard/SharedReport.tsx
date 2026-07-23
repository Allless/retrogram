import { activityHeatmap } from "../stats/activityHeatmap";
import { emojiFrequency } from "../stats/emojiFrequency";
import { MEDIA_LABELS } from "../stats/greatestHits";
import { reactions } from "../stats/reactions";
import { responseTimes } from "../stats/responseTimes";
import { streaks } from "../stats/streaks";
import { volumeOverTime } from "../stats/volumeOverTime";

import type { SharedSummary, SharedTopMedia } from "../share/summary";

function TopMediaRow({
  heading,
  total,
  top,
}: {
  heading: string;
  total: number;
  top: SharedTopMedia[];
}) {
  return (
    <div class="response-section">
      <h4>
        {heading} · {total.toLocaleString()} sent
      </h4>
      {top.length > 0 && (
        <ul class="media-grid">
          {top.map((item, i) => (
            <li key={i} class="media-item">
              {item.thumb ? (
                <img class="media-img" src={item.thumb} alt="" />
              ) : (
                <span class="media-placeholder" aria-hidden="true" />
              )}
              <span class="media-count muted">{item.count}×</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Read-only view of a shared, anonymized summary — reuses the stat modules'
 * own Cards with results reconstructed from the payload, rendering only the
 * sections the sharer chose to include. No login required: this renders for
 * anyone who opens a share link.
 */
export function SharedReport({
  summary,
  onMakeYourOwn,
}: {
  summary: SharedSummary;
  onMakeYourOwn: () => void;
}) {
  const hasResponse =
    summary.yourMedianSeconds !== undefined ||
    summary.theirMedianSeconds !== undefined;
  const hasReactions =
    summary.reactionsGiven !== undefined ||
    summary.reactionsReceived !== undefined;

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
        {summary.messageCount.toLocaleString()} messages, anonymized: aggregate
        numbers only, no names, no message text.
      </p>

      <div class="stat-grid">
        {summary.topChatMessages !== undefined && (
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
                  {summary.topHitReactions ?? 0}×{" "}
                  {(summary.topHitEmoji ?? []).slice(0, 3).join("")}
                </dd>
              </div>
              <div>
                <dt>Longest streak</dt>
                <dd>{summary.longestStreakDays ?? 0} days</dd>
              </div>
            </dl>
          </article>
        )}

        {summary.volume && (
          <article class="stat-card">
            <header class="stat-card-head">
              <h3>{volumeOverTime.title}</h3>
              <p class="muted">{volumeOverTime.description}</p>
            </header>
            <volumeOverTime.Card result={summary.volume} />
          </article>
        )}

        {summary.heatmap && (
          <article class="stat-card">
            <header class="stat-card-head">
              <h3>{activityHeatmap.title}</h3>
              <p class="muted">{activityHeatmap.description}</p>
            </header>
            <activityHeatmap.Card result={summary.heatmap} />
          </article>
        )}

        {hasResponse && (
          <article class="stat-card">
            <header class="stat-card-head">
              <h3>{responseTimes.title}</h3>
              <p class="muted">How fast they reply — medians only.</p>
            </header>
            <responseTimes.Card
              result={{
                yourMedianSeconds: summary.yourMedianSeconds ?? null,
                theirMedianSeconds: summary.theirMedianSeconds ?? null,
                perChat: [],
                theyGhost: [],
                youGhost: [],
              }}
            />
          </article>
        )}

        {summary.topEmoji && (
          <article class="stat-card">
            <header class="stat-card-head">
              <h3>{emojiFrequency.title}</h3>
              <p class="muted">{emojiFrequency.description}</p>
            </header>
            <emojiFrequency.Card result={{ topEmoji: summary.topEmoji }} />
          </article>
        )}

        {hasReactions && (
          <article class="stat-card">
            <header class="stat-card-head">
              <h3>{reactions.title}</h3>
              <p class="muted">{reactions.description}</p>
            </header>
            <reactions.Card
              result={{
                given: summary.reactionsGiven ?? [],
                received: summary.reactionsReceived ?? [],
              }}
            />
          </article>
        )}

        {summary.streaks && (
          <article class="stat-card">
            <header class="stat-card-head">
              <h3>{streaks.title}</h3>
              <p class="muted">{streaks.description}</p>
            </header>
            <streaks.Card result={summary.streaks} />
          </article>
        )}

        {summary.hits && summary.hits.length > 0 && (
          <article class="stat-card">
            <header class="stat-card-head">
              <h3>Greatest hits</h3>
              <p class="muted">Their most-reacted messages.</p>
            </header>
            <ol class="hits">
              {summary.hits.map((hit, i) => (
                <li key={i} class="hit">
                  <div class="hit-head">
                    <span class="hit-count">{hit.reactionCount}</span>
                    <span class="hit-emoji">{hit.reactionEmoji.join(" ")}</span>
                  </div>
                  {hit.thumb && (
                    <img class="hit-media" src={hit.thumb} alt="" />
                  )}
                  {hit.text ? (
                    <blockquote class="hit-text">{hit.text}</blockquote>
                  ) : (
                    !hit.thumb && (
                      <blockquote class="hit-text muted">
                        {MEDIA_LABELS[hit.mediaType]}
                      </blockquote>
                    )
                  )}
                </li>
              ))}
            </ol>
          </article>
        )}

        {(summary.stickerTotal !== undefined ||
          summary.gifTotal !== undefined) && (
          <article class="stat-card">
            <header class="stat-card-head">
              <h3>Top stickers &amp; GIFs</h3>
              <p class="muted">The ones they send most.</p>
            </header>
            <div class="response-times">
              <TopMediaRow
                heading="Stickers"
                total={summary.stickerTotal ?? 0}
                top={summary.stickerTop ?? []}
              />
              <TopMediaRow
                heading="GIFs"
                total={summary.gifTotal ?? 0}
                top={summary.gifTop ?? []}
              />
            </div>
          </article>
        )}
      </div>
    </section>
  );
}
