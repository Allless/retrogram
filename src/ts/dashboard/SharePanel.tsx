import { useState } from "preact/hooks";

import { encryptText } from "../share/crypto";
import { buildShareHash, deflateText } from "../share/link";
import { buildSummary } from "../share/summary";
import { rememberShare, uploadShare } from "../share/telegraph";

import type { Dataset } from "../model/types";

type ShareState =
  | { step: "idle" }
  | { step: "working" }
  | { step: "ready"; url: string; inline: boolean };

/**
 * "Share" produces a link to an ANONYMIZED summary — aggregate numbers only,
 * no names, no text. Preferred form: ciphertext on telegra.ph with the key in
 * the URL fragment (short link). If Telegraph is unreachable, the summary is
 * compressed into the fragment itself — longer link, zero hosting.
 */
export function SharePanel({ dataset }: { dataset: Dataset }) {
  const [state, setState] = useState<ShareState>({ step: "idle" });
  const [copied, setCopied] = useState(false);

  const share = async () => {
    setState({ step: "working" });
    setCopied(false);

    const json = JSON.stringify(buildSummary(dataset));
    const base = `${location.origin}${location.pathname}`;

    try {
      const { payload, key } = await encryptText(json);
      const uploaded = await uploadShare(payload);
      rememberShare(uploaded);
      setState({
        step: "ready",
        url: `${base}${buildShareHash({ kind: "telegraph", path: uploaded.path, key })}`,
        inline: false,
      });
    } catch {
      // Telegraph unreachable/blocked — self-contained fragment link instead.
      const data = await deflateText(json);
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

  if (state.step === "idle" || state.step === "working") {
    return (
      <button
        type="button"
        class="btn-secondary"
        disabled={state.step === "working"}
        onClick={() => void share()}
      >
        {state.step === "working" ? "Preparing…" : "Share"}
      </button>
    );
  }

  return (
    <div class="share-panel">
      <p class="muted">
        Anyone with this link sees an anonymized summary — totals, charts, and
        emoji, never names or messages.
        {state.inline
          ? " (Self-contained link: the data travels inside the URL itself.)"
          : " Encrypted; the key is only in the link."}
      </p>
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
        <button
          type="button"
          class="link-button"
          onClick={() => setState({ step: "idle" })}
        >
          Close
        </button>
      </div>
    </div>
  );
}
