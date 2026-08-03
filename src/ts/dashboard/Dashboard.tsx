import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "preact/hooks";

import { STAT_REGISTRY } from "../stats/allStats";
import { formatRelativeDays } from "../stats/shared/formatDate";
import { AvatarContext, type AvatarSource } from "../media/avatars";
import { getAvatarUrl, getHitPreview } from "../media/downloadMedia";
import { enqueueFetch, focusFetchPriority } from "../media/fetchQueue";
import { HitPreviewContext, type HitPreviewSource } from "../media/hitPreviews";
import { SlidePriorityContext } from "../media/slidePriority";
import { MediaStat } from "./MediaStat";
import { SharePanel } from "./SharePanel";
import ShareIcon from "../../icons/share.svg?react";
import RefreshIcon from "../../icons/refresh.svg?react";
import LogoutIcon from "../../icons/logout.svg?react";
import BulbIcon from "../../icons/bulb.svg?react";
import MoonIcon from "../../icons/moon.svg?react";
import { isDarkApplied, onSchemeChange, setSchemePref } from "../theme";

import type { ComponentChildren } from "preact";
import type { MediaContext, MediaPreview } from "../media/downloadMedia";
import type { Dataset } from "../model/types";

const DAY_MS = 86_400_000;

interface Slide {
  id: string;
  title: string;
  description: string;
  content: ComponentChildren;
}

/** Day/night toggle; the icon shows the mode a click switches to. */
function ThemeToggle() {
  const [dark, setDark] = useState(isDarkApplied);
  useEffect(() => onSchemeChange(() => setDark(isDarkApplied())), []);
  const flip = () => {
    setSchemePref(dark ? "light" : "dark");
    setDark(!dark);
  };
  const target = dark ? "light" : "dark";
  return (
    <button
      type="button"
      class="btn-secondary btn-icon"
      title={`Switch to ${target} theme`}
      aria-label={`Switch to ${target} theme`}
      onClick={flip}
    >
      {dark ? <BulbIcon /> : <MoonIcon />}
    </button>
  );
}

/**
 * Resolves profile photos on demand for whichever peers the visible cards ask
 * about — from the persisted blob store or a live download — so stat cards
 * can render real avatars while staying pure. Peers with neither fall back to
 * initials.
 */
function AvatarProvider({
  media,
  children,
}: {
  media: MediaContext | null;
  children: ComponentChildren;
}) {
  const [urls, setUrls] = useState<Record<string, string | null>>({});
  const requested = useRef(new Set<string>());
  const created = useRef<string[]>([]);

  useEffect(
    () => () => {
      for (const url of created.current) URL.revokeObjectURL(url);
    },
    [],
  );

  const request = useCallback(
    (peerId: string, priority = 0) => {
      if (requested.current.has(peerId)) return;
      requested.current.add(peerId);
      void enqueueFetch(priority, () => getAvatarUrl(media, peerId)).then(
        (url) => {
          if (url) created.current.push(url);
          setUrls((prev) => ({ ...prev, [peerId]: url }));
        },
      );
    },
    [media],
  );

  const source = useMemo<AvatarSource>(
    () => ({ request, urls }),
    [request, urls],
  );

  return (
    <AvatarContext.Provider value={source}>{children}</AvatarContext.Provider>
  );
}

/** Same pattern as AvatarProvider, for "Greatest hits" media previews. */
function HitPreviewProvider({
  media,
  children,
}: {
  media: MediaContext | null;
  children: ComponentChildren;
}) {
  const [previews, setPreviews] = useState<Record<string, MediaPreview | null>>(
    {},
  );
  const requested = useRef(new Set<string>());
  const created = useRef<string[]>([]);

  useEffect(
    () => () => {
      for (const url of created.current) URL.revokeObjectURL(url);
    },
    [],
  );

  const request = useCallback(
    (messageId: string, priority = 0) => {
      if (requested.current.has(messageId)) return;
      requested.current.add(messageId);
      void enqueueFetch(priority, () => getHitPreview(media, messageId)).then(
        (preview) => {
          if (preview) created.current.push(preview.url);
          setPreviews((prev) => ({ ...prev, [messageId]: preview }));
        },
      );
    },
    [media],
  );

  const source = useMemo<HitPreviewSource>(
    () => ({ request, previews }),
    [request, previews],
  );

  return (
    <HitPreviewContext.Provider value={source}>
      {children}
    </HitPreviewContext.Provider>
  );
}

/** Every slide in deck order: registry stats with the sticker/GIF slides
 * spliced into the expression cluster (before `streaks` → `greatest-hits`,
 * the finale), and Share last. */
function buildSlides(dataset: Dataset, media: MediaContext | null): Slide[] {
  const statSlides: Slide[] = STAT_REGISTRY.map((stat) => ({
    id: stat.id,
    title: stat.title,
    description: stat.description,
    content: <stat.Render dataset={dataset} />,
  }));

  const mediaSlides: Slide[] = [
    {
      id: "top-stickers",
      title: "Top stickers",
      description: "The stickers you send most.",
      content: (
        <MediaStat
          dataset={dataset}
          media={media}
          mediaType="sticker"
          emptyLabel="No stickers sent yet."
        />
      ),
    },
    {
      id: "top-gifs",
      title: "Top GIFs",
      description: "The GIFs you send most.",
      content: (
        <MediaStat
          dataset={dataset}
          media={media}
          mediaType="gif"
          emptyLabel="No GIFs sent yet."
        />
      ),
    },
  ];

  const foundStreaks = statSlides.findIndex((s) => s.id === "streaks");
  const streaksAt = foundStreaks === -1 ? statSlides.length : foundStreaks;
  return [
    ...statSlides.slice(0, streaksAt),
    ...mediaSlides,
    ...statSlides.slice(streaksAt),
    {
      id: "share",
      title: "Share your year",
      description:
        "Pick sections and get an anonymized link — never names or messages.",
      content: <SharePanel dataset={dataset} media={media} />,
    },
  ];
}

interface DashboardProps {
  dataset: Dataset;
  media: MediaContext | null;
  onRefresh: () => void;
  onDisconnect: () => void;
}

/**
 * Presents every registered stat as a slide deck — one category per slide,
 * navigable with the buttons, the dots, or the arrow keys. Each stat module
 * computes and renders itself; the dashboard only frames them. Nothing here
 * talks to Telegram except the on-demand media/avatar downloads.
 */
export function Dashboard({
  dataset,
  media,
  onRefresh,
  onDisconnect,
}: DashboardProps) {
  // Memoized so navigation re-renders only the frame — re-rendering every
  // mounted slide per index change recomputes all stats and stalls scrolling.
  const slides = useMemo(() => buildSlides(dataset, media), [dataset, media]);

  // `index` mirrors the scroll position; goTo() drives the scroll — buttons,
  // dots, and arrow keys all funnel through it.
  const [index, setIndex] = useState(0);
  const count = slides.length;
  const trackRef = useRef<HTMLDivElement>(null);

  // Uniform slides: total scrollable distance splits evenly between them.
  const slideStep = (track: HTMLDivElement) =>
    count > 1 ? (track.scrollWidth - track.clientWidth) / (count - 1) : 1;

  const goTo = useCallback(
    (target: number) => {
      const clamped = Math.max(0, Math.min(count - 1, target));
      const track = trackRef.current;
      if (track) {
        track.scrollTo({
          left: clamped * slideStep(track),
          behavior: "smooth",
        });
      }
      setIndex(clamped);
    },
    [count],
  );

  const onTrackScroll = () => {
    const track = trackRef.current;
    if (!track) return;
    const at = Math.round(track.scrollLeft / slideStep(track));
    setIndex(Math.max(0, Math.min(count - 1, at)));
  };

  // Chrome announces the pending snap target mid-gesture, letting the story
  // bar lead the animation; elsewhere onTrackScroll's rounding updates it.
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const onSnapChanging = (event: Event) => {
      const target = (event as { snapTargetInline?: Element | null })
        .snapTargetInline;
      const at = target
        ? Array.prototype.indexOf.call(track.children, target)
        : -1;
      if (at >= 0) setIndex(at);
    };
    track.addEventListener("scrollsnapchanging", onSnapChanging);
    return () =>
      track.removeEventListener("scrollsnapchanging", onSnapChanging);
  }, []);

  const current = Math.min(index, count - 1);
  const indexRef = useRef(current);
  indexRef.current = current;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight") {
        goTo(indexRef.current + 1);
      } else if (event.key === "ArrowLeft") {
        goTo(indexRef.current - 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goTo]);

  // The visible slide's pending media downloads jump the queue.
  useEffect(() => {
    focusFetchPriority(current);
  }, [current]);

  return (
    <AvatarProvider media={media}>
      <HitPreviewProvider media={media}>
        <section class="dashboard">
          <div class="dashboard-head">
            <h2>Your Telegram, in review</h2>
            <div class="head-actions">
              <ThemeToggle />
              <button
                type="button"
                class="btn-secondary btn-icon"
                title="Share your year"
                aria-label="Share your year"
                onClick={() => goTo(count - 1)}
              >
                <ShareIcon />
              </button>
              <button
                type="button"
                class="btn-secondary btn-icon"
                title="Refresh data — re-read your Telegram history"
                aria-label="Refresh data"
                onClick={onRefresh}
              >
                <RefreshIcon />
              </button>
              <button
                type="button"
                class="btn-secondary btn-icon"
                title="Disconnect — forget this browser's data and session"
                aria-label="Disconnect"
                onClick={onDisconnect}
              >
                <LogoutIcon />
              </button>
            </div>
          </div>

          <p class="muted">
            {dataset.meta.messageCount.toLocaleString()} messages analyzed on
            your device{dataset.meta.partial ? " (partial history)" : ""},
            fetched{" "}
            {formatRelativeDays(
              Math.floor((Date.now() - dataset.meta.fetchedAt) / DAY_MS),
            )}
            . Nothing was uploaded.
          </p>

          <div class="story-bar" role="tablist" aria-label="Stats slides">
            {slides.map((s, i) => (
              <button
                type="button"
                key={s.id}
                class={
                  i <= current ? "story-seg story-seg-filled" : "story-seg"
                }
                aria-label={s.title}
                aria-selected={i === current}
                role="tab"
                onClick={() => goTo(i)}
              />
            ))}
          </div>

          <div class="slide-track" ref={trackRef} onScroll={onTrackScroll}>
            {slides.map((s, i) => (
              <article class="stat-card slide-card" key={s.id}>
                <header class="stat-card-head">
                  <h3>{s.title}</h3>
                  <p class="muted">{s.description}</p>
                </header>
                <SlidePriorityContext.Provider value={i}>
                  {s.content}
                </SlidePriorityContext.Provider>
              </article>
            ))}
          </div>

          <nav class="slide-nav" aria-label="Slide navigation">
            <button
              type="button"
              class="btn-secondary"
              disabled={current === 0}
              onClick={() => goTo(current - 1)}
            >
              ← Prev
            </button>
            <span class="slide-count muted">
              {current + 1} / {count}
            </span>
            <button
              type="button"
              class="btn-secondary"
              disabled={current === count - 1}
              onClick={() => goTo(current + 1)}
            >
              Next →
            </button>
          </nav>
        </section>
      </HitPreviewProvider>
    </AvatarProvider>
  );
}
