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
import { HitPreviewContext, type HitPreviewSource } from "../media/hitPreviews";
import { MediaStat } from "./MediaStat";
import { SharePanel } from "./SharePanel";

import type { ComponentChildren } from "preact";
import type { MediaContext, MediaPreview } from "../media/downloadMedia";
import type { Dataset } from "../model/types";

const DAY_MS = 86_400_000;

function IconBase({ children }: { children: ComponentChildren }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

function ShareIcon() {
  return (
    <IconBase>
      <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
      <polyline points="16 6 12 2 8 6" />
      <line x1="12" y1="2" x2="12" y2="15" />
    </IconBase>
  );
}

function RefreshIcon() {
  return (
    <IconBase>
      <path d="M21 12a9 9 0 1 1-2.64-6.36L21 8" />
      <polyline points="21 3 21 8 16 8" />
    </IconBase>
  );
}

function LogoutIcon() {
  return (
    <IconBase>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </IconBase>
  );
}

interface Slide {
  id: string;
  title: string;
  description: string;
  content: ComponentChildren;
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
    (peerId: string) => {
      if (requested.current.has(peerId)) return;
      requested.current.add(peerId);
      void getAvatarUrl(media, peerId).then((url) => {
        if (url) created.current.push(url);
        setUrls((prev) => ({ ...prev, [peerId]: url }));
      });
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
    (messageId: string) => {
      if (requested.current.has(messageId)) return;
      requested.current.add(messageId);
      void getHitPreview(media, messageId).then((preview) => {
        if (preview) created.current.push(preview.url);
        setPreviews((prev) => ({ ...prev, [messageId]: preview }));
      });
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
  const slides: Slide[] = [
    ...STAT_REGISTRY.map((stat) => ({
      id: stat.id,
      title: stat.title,
      description: stat.description,
      content: <stat.Render dataset={dataset} />,
    })),
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
    {
      id: "share",
      title: "Share your year",
      description:
        "Pick sections and get an anonymized link — never names or messages.",
      content: <SharePanel dataset={dataset} media={media} />,
    },
  ];

  const [index, setIndex] = useState(0);
  const count = slides.length;
  const goTo = useCallback(
    (target: number) => {
      setIndex(Math.max(0, Math.min(count - 1, target)));
    },
    [count],
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight") {
        setIndex((i) => Math.min(count - 1, i + 1));
      } else if (event.key === "ArrowLeft") {
        setIndex((i) => Math.max(0, i - 1));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [count]);

  const current = Math.min(index, count - 1);
  const slide = slides[current];

  return (
    <AvatarProvider media={media}>
      <HitPreviewProvider media={media}>
        <section class="dashboard">
          <div class="dashboard-head">
            <h2>Your Telegram, in review</h2>
            <div class="head-actions">
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

          <article class="stat-card slide-card" key={slide.id}>
            <header class="stat-card-head">
              <h3>{slide.title}</h3>
              <p class="muted">{slide.description}</p>
            </header>
            {slide.content}
          </article>

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
