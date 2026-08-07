import { useState } from "preact/hooks";

import { debug } from "../debug";
import { encryptText } from "../share/crypto";
import { buildShareHash, deflateText } from "../share/link";
import {
  ALL_SHARE_SECTIONS,
  buildShare,
  DEFAULT_SHARE_SECTIONS,
  SHARE_EXTRAS,
  SHARE_SECTIONS,
  stripHeavy,
  stripThumbs,
  type ShareSection,
} from "../share/summary";
import { embedThumbs } from "../share/thumbs";
import {
  MAX_SUMMARY_CHARS,
  rememberShare,
  uploadShare,
} from "../share/telegraph";

import type { MediaResolver } from "../media/downloadMedia";
import type { Dataset } from "../model/types";

type ShareState =
  | { step: "idle" }
  | { step: "working"; note: string }
  | {
      step: "ready";
      url: string;
      /** How the payload travelled: hosted, hosted minus images, or in-URL. */
      mode: "hosted" | "hostedNoThumbs" | "inline";
    };

/**
 * The "Share your year" slide: pick sections, get a link to an ANONYMIZED
 * summary — aggregate numbers only unless explicitly opted into message text
 * or media thumbnails. Preferred form: ciphertext on telegra.ph with the key
 * in the URL fragment (short link). If Telegraph is unreachable, the summary
 * is compressed into the fragment itself — longer link, zero hosting, and
 * thumbnails are dropped to keep it sendable.
 */
export function SharePanel({
  dataset,
  media,
}: {
  dataset: Dataset;
  media: MediaResolver | null;
}) {
  // Defaults to your-data-only: sections describing other people (and the
  // message-content opt-in) start off.
  const [selected, setSelected] = useState<Set<ShareSection>>(
    () => new Set(DEFAULT_SHARE_SECTIONS),
  );
  const [state, setState] = useState<ShareState>({ step: "idle" });
  const [copied, setCopied] = useState(false);

  const toggle = (key: ShareSection) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
    setState({ step: "idle" });
    setCopied(false);
  };

  const selectAll = (keys: ShareSection[]) => {
    setSelected(new Set(keys));
    setState({ step: "idle" });
    setCopied(false);
  };

  const share = async () => {
    setState({ step: "working", note: "Preparing…" });
    setCopied(false);
    // Let the busy state paint before the heavy synchronous stat computes —
    // otherwise the button appears frozen for the whole build.
    await new Promise((resolve) => setTimeout(resolve, 0));

    const { summary, thumbSources } = buildShare(dataset, selected);
    // Sticker/GIF thumbs always embed with their section (public catalog
    // items); hit text + photo/video thumbs only with the explicit opt-in.
    const sources = {
      hits: selected.has("hitContent") ? thumbSources.hits : [],
      stickers: thumbSources.stickers,
      gifs: thumbSources.gifs,
    };
    if (
      sources.hits.some(Boolean) ||
      sources.stickers.length > 0 ||
      sources.gifs.length > 0
    ) {
      // Thumbnails go in last, sized to whatever room the chosen sections
      // leave under the payload ceiling — so picking more sections shrinks
      // the images instead of breaking the hosted share.
      const room = MAX_SUMMARY_CHARS - JSON.stringify(summary).length;
      if (room > 0) {
        await embedThumbs(
          summary,
          sources,
          media,
          (done, total) =>
            setState({ step: "working", note: `Thumbnails ${done}/${total}…` }),
          room,
        );
      }
    }
    setState({ step: "working", note: "Encrypting & uploading…" });
    const base = `${location.origin}${location.pathname}`;
    const hostedUrl = (path: string, key: string) =>
      `${base}${buildShareHash({ kind: "telegraph", path, key })}`;

    // Prefer hosting the full payload; if it doesn't fit, hosting it without
    // thumbnails keeps every section — far better than dropping down to a
    // link that carries only the aggregates.
    for (const attempt of ["full", "noThumbs"] as const) {
      const payloadSummary =
        attempt === "full" ? summary : stripThumbs(summary);
      try {
        const { payload, key } = await encryptText(
          JSON.stringify(payloadSummary),
        );
        const uploaded = await uploadShare(payload);
        rememberShare(uploaded);
        setState({
          step: "ready",
          url: hostedUrl(uploaded.path, key),
          mode: attempt === "full" ? "hosted" : "hostedNoThumbs",
        });
        return;
      } catch (err) {
        debug("share upload failed", { attempt, err });
      }
    }

    // Telegraph unreachable — self-contained fragment link, aggregates only.
    const data = await deflateText(JSON.stringify(stripHeavy(summary)));
    setState({
      step: "ready",
      url: `${base}${buildShareHash({ kind: "inline", data })}`,
      mode: "inline",
    });
  };

  const copy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  // The Greatest-hits content opt-in needs that section; the identities
  // opt-in applies to every per-chat section, so it's always available.
  const extraDisabled = (key: ShareSection): boolean =>
    key === "hitContent" && !selected.has("hits");

  return (
    <div class="share-panel">
      <div class="share-presets">
        <button
          type="button"
          class="link-button"
          onClick={() => selectAll(ALL_SHARE_SECTIONS)}
        >
          Share everything
        </button>
        <button
          type="button"
          class="link-button"
          onClick={() => selectAll(DEFAULT_SHARE_SECTIONS)}
        >
          Only my own data
        </button>
        <button type="button" class="link-button" onClick={() => selectAll([])}>
          Clear
        </button>
      </div>

      <div class="share-options">
        {SHARE_SECTIONS.filter((s) => !("aboutOthers" in s)).map((section) => (
          <label key={section.key} class="share-option">
            <input
              type="checkbox"
              checked={selected.has(section.key)}
              onChange={() => toggle(section.key)}
            />
            {section.label}
          </label>
        ))}
      </div>

      <div class="share-group">
        <p class="share-group-head muted">
          Includes other people&apos;s numbers — aggregated and unnamed, off by
          default
        </p>
        <div class="share-options">
          {SHARE_SECTIONS.filter((s) => "aboutOthers" in s).map((section) => (
            <label key={section.key} class="share-option">
              <input
                type="checkbox"
                checked={selected.has(section.key)}
                onChange={() => toggle(section.key)}
              />
              {section.label}
            </label>
          ))}
        </div>
      </div>

      <div class="share-extras">
        {SHARE_EXTRAS.map(({ key, label }) => (
          <label key={key} class="share-option">
            <input
              type="checkbox"
              checked={selected.has(key) && !extraDisabled(key)}
              disabled={extraDisabled(key)}
              onChange={() => toggle(key)}
            />
            {label}
          </label>
        ))}
        {selected.has("identities") && (
          <p class="muted hint">
            Names travel inside the link; public profile photos are loaded from
            t.me when someone opens it, so their browser requests those images
            from Telegram. Contacts without a public @username show initials.
          </p>
        )}
      </div>

      {state.step !== "ready" ? (
        <button
          type="button"
          class="btn-primary"
          disabled={state.step === "working" || selected.size === 0}
          onClick={() => void share()}
        >
          {state.step === "working" ? state.note : "Create share link"}
        </button>
      ) : (
        <>
          <code class="share-url">{state.url}</code>
          <div class="share-actions">
            <button
              type="button"
              class="btn-primary"
              onClick={() => void copy(state.url)}
            >
              {copied ? "Copied!" : "Copy link"}
            </button>
            {typeof navigator.share === "function" && (
              <button
                type="button"
                class="btn-secondary"
                onClick={() =>
                  void navigator
                    .share({ title: "My Telegram, in review", url: state.url })
                    .catch(() => undefined)
                }
              >
                Share…
              </button>
            )}
          </div>
          {state.mode === "hostedNoThumbs" && (
            <p class="muted">
              Thumbnails were left out so the share fits telegra.ph&apos;s page
              limit — every section is still included.
            </p>
          )}
          {state.mode === "inline" && (
            <p class="muted">
              telegra.ph wasn&apos;t reachable, so this link carries the data
              inside the URL itself — the aggregate sections only (no thumbnails
              or per-contact lists), to keep the link sendable.
            </p>
          )}
        </>
      )}

      <p class="muted">
        The link shows an anonymized summary of the checked sections — totals,
        charts, and emoji, never names. Message text and media previews are only
        included with the explicit opt-in below.
        {state.step === "ready" && state.mode !== "inline"
          ? " Encrypted; the key exists only inside the link."
          : ""}
      </p>
    </div>
  );
}
