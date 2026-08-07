import { useEffect, useState } from "preact/hooks";

import { Dashboard } from "./dashboard/Dashboard";
import { SharedReport } from "./dashboard/SharedReport";
import { telegramPlatform } from "./platforms/telegram";
import { whatsappPlatform } from "./platforms/whatsapp";
import { decryptText } from "./share/crypto";
import { inflateText, parseShareHash } from "./share/link";
import { shareStatus } from "./share/summary";
import { fetchShare } from "./share/telegraph";
import { clearDataset, loadDataset, saveDataset } from "./store/datasetCache";
import { REPO_URL } from "./links";
import Logo from "../logo.svg?react";

import type { IngestProgress, PlatformSession } from "./platforms/types";
import type { ShareRef } from "./share/link";
import type { SharedSummary } from "./share/summary";
import type { Dataset } from "./model/types";

type Status = "connect" | "loading" | "ready" | "error";

// Telegram is the main flow; WhatsApp is offered as a beta behind a query
// param until it earns its own page.
const platform =
  new URLSearchParams(location.search).get("platform") === "whatsapp"
    ? whatsappPlatform
    : telegramPlatform;

/**
 * Root component and data-flow controller. On connect it reads the account's
 * history into a normalized `Dataset` (from the IndexedDB cache if present,
 * otherwise a fresh ingest), then hands it to the dashboard. Everything stays
 * on-device — Rewindly has no backend.
 */
export function App() {
  // Dev-only: `?fixture` renders the dashboard with the sample dataset.
  if (import.meta.env.DEV && location.search.includes("fixture")) {
    return <FixtureApp />;
  }
  return <ConnectedApp />;
}

function FixtureApp() {
  const [dataset, setDataset] = useState<Dataset | null>(null);
  useEffect(() => {
    void import("./model/fixture").then((m) => setDataset(m.sampleDataset));
  }, []);
  if (!dataset) return <p class="muted">Loading fixture…</p>;
  return (
    <div class="app">
      <main>
        <Dashboard
          dataset={dataset}
          media={null}
          onDisconnect={() => undefined}
        />
      </main>
    </div>
  );
}

function ConnectedApp() {
  const [status, setStatus] = useState<Status>("connect");
  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [session, setSession] = useState<PlatformSession | null>(null);
  const [progress, setProgress] = useState<IngestProgress | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Opened via a share link? Render the shared summary instead of the login
  // flow — no Telegram session needed for viewing.
  const [shareRef, setShareRef] = useState<ShareRef | null>(() =>
    parseShareHash(location.hash),
  );
  const [sharedSummary, setSharedSummary] = useState<SharedSummary | null>(
    null,
  );
  const [shareError, setShareError] = useState<string | null>(null);

  useEffect(() => {
    if (!shareRef) return;
    let cancelled = false;
    setSharedSummary(null);
    setShareError(null);
    loadSharedSummary(shareRef)
      .then((summary) => {
        if (!cancelled) setSharedSummary(summary);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setShareError(
            err instanceof Error ? err.message : "Couldn't load this share.",
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [shareRef]);

  const exitShared = () => {
    history.replaceState(null, "", location.pathname + location.search);
    setShareRef(null);
    setSharedSummary(null);
    setShareError(null);
  };

  const handleConnected = async (connected: PlatformSession) => {
    setStatus("loading");
    setError(null);
    setSession(connected);
    try {
      setDataset(await loadOrIngest(connected, setProgress));
      setStatus("ready");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Couldn't read your Telegram data.",
      );
      setStatus("error");
    }
  };

  // Re-ingest, bypassing the cache. The old entry survives until the new
  // ingest succeeds, so an interrupted refresh keeps the existing results.
  const handleRefresh = async () => {
    if (!session?.canRefresh) return;
    setStatus("loading");
    setError(null);
    setProgress(null);
    try {
      setDataset(await ingestFresh(session, setProgress));
      setStatus("ready");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Couldn't read your Telegram data.",
      );
      setStatus("error");
    }
  };

  const handleDisconnect = () => {
    // Only this platform's data: ids are namespaced (`wa:` etc. — see
    // platforms/types.ts), Telegram's are legacy-unprefixed.
    void clearDataset(
      platform.id === "whatsapp"
        ? (key) => key.includes("wa:")
        : (key) => !key.includes("wa:"),
    );
    void session?.disconnect();
    setDataset(null);
    setSession(null);
    setError(null);
    setStatus("connect");
  };

  const media = session?.media ?? null;

  return (
    <div class="app">
      <header class="app-header">
        <h1 class="wordmark">
          <a
            class="wordmark-link"
            href={location.pathname}
            onClick={(event) => {
              // Shared view exits in place; otherwise let the link navigate
              // (e.g. from ?platform=whatsapp back home).
              if (shareRef) {
                event.preventDefault();
                exitShared();
              }
            }}
          >
            <Logo class="wordmark-logo" />
            Rewindly
          </a>
        </h1>
        <p class="tagline">
          Your {platform.name}, rewound — 100% in your browser
        </p>
      </header>

      <main>
        {shareRef && shareError && (
          <div class="error-panel">
            <p>{shareError}</p>
            <button type="button" class="btn-secondary" onClick={exitShared}>
              Go to Rewindly
            </button>
          </div>
        )}

        {shareRef && !shareError && !sharedSummary && (
          <p class="muted">Loading shared report…</p>
        )}

        {shareRef && !shareError && sharedSummary && (
          <SharedReport summary={sharedSummary} onMakeYourOwn={exitShared} />
        )}

        {!shareRef && status === "connect" && (
          <>
            <platform.ConnectScreen onConnected={handleConnected} />
            {platform.id === "telegram" && (
              <p class="muted hint beta-link">
                WhatsApp user?{" "}
                <a href="?platform=whatsapp">Try the WhatsApp rewind (beta)</a>
              </p>
            )}
          </>
        )}

        {!shareRef && status === "loading" && (
          <div class="muted">
            <p>
              Reading your {platform.name} history on this device…
              {platform.id === "telegram" &&
                " Telegram rate-limits large accounts, so this can pause and take a few minutes."}
            </p>
            {progress && (
              <p>
                {progress.chatsDone}/{progress.chatsTotal} chats ·{" "}
                {progress.messages.toLocaleString()} messages
              </p>
            )}
          </div>
        )}

        {!shareRef && status === "error" && (
          <div class="error-panel">
            <p>{error}</p>
            <button
              type="button"
              class="btn-secondary"
              onClick={handleDisconnect}
            >
              Start over
            </button>
          </div>
        )}

        {!shareRef && status === "ready" && dataset && (
          <Dashboard
            dataset={dataset}
            media={media}
            onRefresh={
              session?.canRefresh ? () => void handleRefresh() : undefined
            }
            onDisconnect={handleDisconnect}
            supportsSlide={platform.supports}
          />
        )}
      </main>

      <footer class="app-footer">
        <p class="muted">
          Open source (MIT) ·{" "}
          <a href={REPO_URL} target="_blank" rel="noopener noreferrer">
            Source &amp; issues on GitHub
          </a>{" "}
          · No backend, no analytics, no tracking — not affiliated with Telegram
          or WhatsApp.
          {__COMMIT_HASH__ && (
            <>
              {" · Deployed from "}
              <a
                href={`${REPO_URL}/commit/${__COMMIT_HASH__}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <code>{__COMMIT_HASH__}</code>
              </a>
            </>
          )}
        </p>
      </footer>
    </div>
  );
}

/** Resolve a share link to its summary: fetch+decrypt, or inflate inline data. */
async function loadSharedSummary(ref: ShareRef): Promise<SharedSummary> {
  const json =
    ref.kind === "inline"
      ? await inflateText(ref.data)
      : await decryptText(await fetchShare(ref.path), ref.key);
  const parsed: unknown = JSON.parse(json);
  const status = shareStatus(parsed);
  if (status === "unsupported") {
    throw new Error(
      "This share was made with a different version of Rewindly and can't be opened. Ask for a fresh link.",
    );
  }
  if (status === "invalid") {
    throw new Error("This link doesn't contain a valid Rewindly share.");
  }
  return parsed as SharedSummary;
}

/** Reuse the cached dataset for this account if present, else ingest and cache. */
async function loadOrIngest(
  session: PlatformSession,
  onProgress: (p: IngestProgress) => void,
): Promise<Dataset> {
  if (session.usesCache) {
    const cached = await loadDataset(await session.selfId());
    if (cached && cached.meta.messageCount > 0) {
      await session.onCacheRestored();
      return cached;
    }
  }
  return ingestFresh(session, onProgress);
}

/** Ingest from the platform and cache the result. */
async function ingestFresh(
  session: PlatformSession,
  onProgress: (p: IngestProgress) => void,
): Promise<Dataset> {
  const dataset = await session.ingest({ onProgress });
  await saveDataset(dataset);
  return dataset;
}
