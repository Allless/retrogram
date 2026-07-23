import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "preact/hooks";

import { STAT_REGISTRY } from "../stats/allStats";
import { AvatarContext, type AvatarSource } from "../media/avatars";
import { getAvatarUrl } from "../media/downloadMedia";
import { MediaStat } from "./MediaStat";
import { SharePanel } from "./SharePanel";

import type { ComponentChildren } from "preact";
import type { MediaContext } from "../media/downloadMedia";
import type { Dataset } from "../model/types";

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

interface DashboardProps {
  dataset: Dataset;
  media: MediaContext | null;
  onDisconnect: () => void;
}

/**
 * Presents every registered stat as a slide deck — one category per slide,
 * navigable with the buttons, the dots, or the arrow keys. Each stat module
 * computes and renders itself; the dashboard only frames them. Nothing here
 * talks to Telegram except the on-demand media/avatar downloads.
 */
export function Dashboard({ dataset, media, onDisconnect }: DashboardProps) {
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
      <section class="dashboard">
        <div class="dashboard-head">
          <h2>Your Telegram, in review</h2>
          <button type="button" class="btn-secondary" onClick={onDisconnect}>
            Disconnect
          </button>
        </div>

        <p class="muted">
          {dataset.meta.messageCount.toLocaleString()} messages analyzed on your
          device{dataset.meta.partial ? " (partial history)" : ""}. Nothing was
          uploaded.
        </p>

        <SharePanel dataset={dataset} />

        <div class="story-bar" role="tablist" aria-label="Stats slides">
          {slides.map((s, i) => (
            <button
              type="button"
              key={s.id}
              class={i <= current ? "story-seg story-seg-filled" : "story-seg"}
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
    </AvatarProvider>
  );
}
