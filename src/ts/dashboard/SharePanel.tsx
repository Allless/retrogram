import { useState } from "preact/hooks";

import { encryptText } from "../share/crypto";
import { buildShareHash, deflateText } from "../share/link";
import {
  buildShare,
  SHARE_EXTRAS,
  SHARE_SECTIONS,
  stripThumbs,
  type ShareSection,
} from "../share/summary";
import { embedThumbs } from "../share/thumbs";
import { rememberShare, uploadShare } from "../share/telegraph";

import type { MediaContext } from "../media/downloadMedia";
import type { Dataset } from "../model/types";

type ShareState =
  | { step: "idle" }
  | { step: "working"; note: string }
  | { step: "ready"; url: string; inline: boolean };

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
  media: MediaContext | null;
}) {
  const [selected, setSelected] = useState<Set<ShareSection>>(
    () => new Set(SHARE_SECTIONS.map((s) => s.key)),
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
      await embedThumbs(summary, sources, media, (done, total) =>
        setState({ step: "working", note: `Thumbnails ${done}/${total}…` }),
      );
    }
    setState({ step: "working", note: "Encrypting & uploading…" });
    const base = `${location.origin}${location.pathname}`;

    try {
      const { payload, key } = await encryptText(JSON.stringify(summary));
      const uploaded = await uploadShare(payload);
      rememberShare(uploaded);
      setState({
        step: "ready",
        url: `${base}${buildShareHash({ kind: "telegraph", path: uploaded.path, key })}`,
        inline: false,
      });
    } catch {
      // Telegraph unreachable/blocked — self-contained fragment link instead
      // (without thumbnails, which would make the URL unsendable).
      const data = await deflateText(JSON.stringify(stripThumbs(summary)));
      setState({
        step: "ready",
        url: `${base}${buildShareHash({ kind: "inline", data })}`,
        inline: true,
      });
    }
  };

  const copy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  // The opt-in reveals Greatest hits content, so it needs that section.
  const extraDisabled = (): boolean => !selected.has("hits");

  return (
    <div class="share-panel">
      <div class="share-options">
        {SHARE_SECTIONS.map(({ key, label }) => (
          <label key={key} class="share-option">
            <input
              type="checkbox"
              checked={selected.has(key)}
              onChange={() => toggle(key)}
            />
            {label}
          </label>
        ))}
      </div>

      <div class="share-extras">
        {SHARE_EXTRAS.map(({ key, label }) => (
          <label key={key} class="share-option">
            <input
              type="checkbox"
              checked={selected.has(key) && !extraDisabled()}
              disabled={extraDisabled()}
              onChange={() => toggle(key)}
            />
            {label}
          </label>
        ))}
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
          {state.inline && (
            <p class="muted">
              telegra.ph wasn&apos;t reachable, so this link carries the data
              inside the URL itself — longer, thumbnails omitted, but works the
              same.
            </p>
          )}
        </>
      )}

      <p class="muted">
        The link shows an anonymized summary of the checked sections — totals,
        charts, and emoji. Names and messages stay out unless you opt in above.
        {state.step === "ready" && !state.inline
          ? " Encrypted; the key exists only inside the link."
          : ""}
      </p>
    </div>
  );
}
