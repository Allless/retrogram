import { useCallback, useEffect, useRef, useState } from "preact/hooks";

import { focusFetchPriority } from "../media/fetchQueue";
import { SlidePriorityContext } from "../media/slidePriority";

import type { ComponentChildren } from "preact";

export interface Slide {
  id: string;
  title: string;
  /** One emoji, shown beside the title. */
  icon: string;
  description: string;
  content: ComponentChildren;
}

/**
 * The story deck: every slide stays mounted in one horizontal scroll-snap
 * track, so navigation costs nothing and swiping is native scroll. The story
 * bar, arrow keys, and Prev/Next all drive the same `goTo`. Used by both the
 * dashboard and the shared-report page so a share looks like the real thing.
 */
export function SlideDeck({
  slides,
  children,
}: {
  slides: Slide[];
  /** Rendered above the story bar (heading, actions, coverage line). */
  children?: ComponentChildren;
}) {
  // `index` mirrors the scroll position; goTo() drives the scroll.
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
    <section class="dashboard">
      {children}

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

      <div class="slide-track" ref={trackRef} onScroll={onTrackScroll}>
        {slides.map((s, i) => (
          <article class="stat-card slide-card" key={s.id}>
            <header class="stat-card-head">
              <h3>
                <span class="slide-icon" aria-hidden="true">
                  {s.icon}
                </span>
                {s.title}
              </h3>
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
  );
}
