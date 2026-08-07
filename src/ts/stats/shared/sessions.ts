/**
 * Conversation-session segmentation from inter-message gaps, after Halfaker
 * et al. (WWW 2015): log inter-activity times are bimodal — one component of
 * within-conversation gaps, one of between-conversation gaps — so a
 * two-component Gaussian mixture fitted on log gaps yields a per-chat
 * boundary at the valley between the components. Falls back to a 1-hour
 * threshold (their cross-domain rule of thumb) when a chat has too few gaps
 * or the fit degenerates. Deterministic: quantile init, fixed iterations.
 */

// Dyadic chats pause and resume: sensitivity analysis on real chats shows
// initiation/ghosting metrics only stabilize with boundaries of several
// hours, so both the fallback and the clamp floor sit at 4h (Halfaker's ~1h
// was derived for solo activity sessions, not two-person conversations).
const FALLBACK_MS = 4 * 60 * 60 * 1000;
const MIN_GAPS = 30;
// Chat gaps have three modes: typing bursts (seconds), within-conversation
// pauses (minutes), between-conversation silences (hours+). The burst mode
// dominates and would capture one of the two mixture components, putting the
// "boundary" inside conversations — so gaps below this floor are excluded
// from the fit (they can never be session boundaries anyway).
const BURST_FLOOR_MS = 2 * 60 * 1000;
const MIN_SEPARATION = 0.5; // component means closer than half a decade → unimodal
const MIN_WEIGHT = 0.05;
const CLAMP_MIN_MS = 4 * 60 * 60 * 1000;
const CLAMP_MAX_MS = 3 * 24 * 60 * 60 * 1000;
const EM_ITERATIONS = 60;

interface Component {
  weight: number;
  mean: number;
  variance: number;
}

function normalPdf(x: number, c: Component): number {
  const d = x - c.mean;
  return (
    (c.weight / Math.sqrt(2 * Math.PI * c.variance)) *
    Math.exp(-(d * d) / (2 * c.variance))
  );
}

function stats(xs: number[]): { mean: number; variance: number } {
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  const variance =
    xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length || 1e-4;
  return { mean, variance };
}

/**
 * The session boundary for a chat, from its inter-message gaps (ms).
 * Returns a clamped threshold; gaps larger than it separate conversations.
 */
export function sessionThresholdMs(gapsMs: number[]): number {
  // Log-domain, in seconds, clamped to ≥1s (minute-granularity exports
  // produce zero gaps).
  const xs = gapsMs
    .filter((g) => g >= BURST_FLOOR_MS)
    .map((g) => Math.log10(g / 1000));
  if (xs.length < MIN_GAPS) return FALLBACK_MS;

  // Deterministic init: split at the median.
  const sorted = [...xs].sort((a, b) => a - b);
  const half = Math.floor(sorted.length / 2);
  let a: Component = { weight: 0.5, ...stats(sorted.slice(0, half)) };
  let b: Component = { weight: 0.5, ...stats(sorted.slice(half)) };

  for (let iter = 0; iter < EM_ITERATIONS; iter++) {
    // E-step: responsibilities.
    const ra: number[] = new Array<number>(xs.length);
    for (let i = 0; i < xs.length; i++) {
      const pa = normalPdf(xs[i], a);
      const pb = normalPdf(xs[i], b);
      ra[i] = pa + pb > 0 ? pa / (pa + pb) : 0.5;
    }
    // M-step.
    const update = (resp: (i: number) => number, prev: Component) => {
      const w = xs.reduce((s, _, i) => s + resp(i), 0);
      if (w < 1e-6) return prev;
      const mean = xs.reduce((s, x, i) => s + resp(i) * x, 0) / w;
      const variance = Math.max(
        xs.reduce((s, x, i) => s + resp(i) * (x - mean) ** 2, 0) / w,
        1e-4,
      );
      return { weight: w / xs.length, mean, variance };
    };
    a = update((i) => ra[i], a);
    b = update((i) => 1 - ra[i], b);
  }

  if (a.mean > b.mean) [a, b] = [b, a];
  if (
    b.mean - a.mean < MIN_SEPARATION ||
    a.weight < MIN_WEIGHT ||
    b.weight < MIN_WEIGHT
  ) {
    return FALLBACK_MS;
  }

  // Valley: the mixture-density minimum between the component means.
  let bestX = (a.mean + b.mean) / 2;
  let bestPdf = Infinity;
  const steps = 200;
  for (let i = 0; i <= steps; i++) {
    const x = a.mean + ((b.mean - a.mean) * i) / steps;
    const pdf = normalPdf(x, a) + normalPdf(x, b);
    if (pdf < bestPdf) {
      bestPdf = pdf;
      bestX = x;
    }
  }
  const thresholdMs = 10 ** bestX * 1000;
  return Math.min(Math.max(thresholdMs, CLAMP_MIN_MS), CLAMP_MAX_MS);
}

/** Split chronologically sorted items into sessions at the threshold. */
export function splitSessions<T extends { timestamp: number }>(
  items: T[],
  thresholdMs: number,
): T[][] {
  const sessions: T[][] = [];
  let current: T[] = [];
  for (const item of items) {
    const prev = current[current.length - 1];
    if (prev && item.timestamp - prev.timestamp > thresholdMs) {
      sessions.push(current);
      current = [];
    }
    current.push(item);
  }
  if (current.length > 0) sessions.push(current);
  return sessions;
}
