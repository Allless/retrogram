import { useEffect, useState } from "preact/hooks";

import { QrConnect } from "./auth/QrConnect";
import { clearSession } from "./auth/qrLogin";
import { Dashboard } from "./dashboard/Dashboard";
import { SharedReport } from "./dashboard/SharedReport";
import { fetchPeerRefs, ingest } from "./ingestion/ingest";
import { decryptText } from "./share/crypto";
import { inflateText, parseShareHash } from "./share/link";
import { isSharedSummary } from "./share/summary";
import { fetchShare } from "./share/telegraph";
import { clearDataset, loadDataset, saveDataset } from "./store/datasetCache";
import { REPO_URL } from "./links";

import type { HitRefs, MediaRefs, PeerRefs } from "./ingestion/ingest";
import type { ShareRef } from "./share/link";
import type { SharedSummary } from "./share/summary";
import type { TelegramClient } from "telegram";
import type { Dataset } from "./model/types";

type Status = "connect" | "loading" | "ready" | "error";

interface Progress {
  chatsDone: number;
  chatsTotal: number;
  messages: number;
}

/**
 * Root component and data-flow controller. On connect it reads the account's
 * history into a normalized `Dataset` (from the IndexedDB cache if present,
 * otherwise a fresh ingest), then hands it to the dashboard. Everything stays
 * on-device — Retrogram has no backend.
 */
export function App() {
  const [status, setStatus] = useState<Status>("connect");
  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [client, setClient] = useState<TelegramClient | null>(null);
  const [mediaRefs, setMediaRefs] = useState<MediaRefs>(new Map());
  const [peerRefs, setPeerRefs] = useState<PeerRefs>(new Map());
  const [hitRefs, setHitRefs] = useState<HitRefs>(new Map());
  const [progress, setProgress] = useState<Progress | null>(null);
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

  const handleConnected = async (connected: TelegramClient) => {
    setStatus("loading");
    setError(null);
    setClient(connected);
    try {
      const {
        dataset: data,
        mediaRefs: refs,
        peerRefs: peers,
        hitRefs: hits,
      } = await loadOrIngest(connected, setProgress);
      setDataset(data);
      setMediaRefs(refs);
      setPeerRefs(peers);
      setHitRefs(hits);
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
    void clearDataset();
    clearSession();
    setDataset(null);
    setClient(null);
    setMediaRefs(new Map());
    setPeerRefs(new Map());
    setHitRefs(new Map());
    setError(null);
    setStatus("connect");
  };

  // Media downloads need a live client; the refs only exist after a fresh
  // ingest (a cache-restored dataset shows fallbacks instead).
  const media = client
    ? { client, refs: mediaRefs, peers: peerRefs, messages: hitRefs }
    : null;

  return (
    <div class="app">
      <header class="app-header">
        <h1 class="wordmark">
          <a
            class="wordmark-link"
            href={location.pathname}
            onClick={(event) => {
              event.preventDefault();
              if (shareRef) exitShared();
            }}
          >
            <span class="wordmark-rewind" aria-hidden="true">
              ◀◀
            </span>
            Retrogram
          </a>
        </h1>
        <p class="tagline">Your Telegram, in review — 100% in your browser</p>
      </header>

      <main>
        {shareRef && shareError && (
          <div class="error-panel">
            <p>{shareError}</p>
            <button type="button" class="btn-secondary" onClick={exitShared}>
              Go to Retrogram
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
          <QrConnect onConnected={handleConnected} />
        )}

        {!shareRef && status === "loading" && (
          <div class="muted">
            <p>
              Reading your Telegram history (last 12 months) on this device…
              Telegram rate-limits large accounts, so this can pause and take a
              few minutes.
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
            onDisconnect={handleDisconnect}
          />
        )}
      </main>

      <footer class="app-footer">
        <p class="muted">
          Open source (MIT) ·{" "}
          <a href={REPO_URL} target="_blank" rel="noopener noreferrer">
            Source &amp; issues on GitHub
          </a>{" "}
          · No backend, no analytics, no tracking — not affiliated with
          Telegram.
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
  if (!isSharedSummary(parsed)) {
    throw new Error("This link doesn't contain a valid Retrogram share.");
  }
  return parsed;
}

/** Reuse the cached dataset for this account if present, else ingest and cache. */
async function loadOrIngest(
  client: TelegramClient,
  onProgress: (p: Progress) => void,
): Promise<{
  dataset: Dataset;
  mediaRefs: MediaRefs;
  peerRefs: PeerRefs;
  hitRefs: HitRefs;
}> {
  const me = await client.getMe();
  const selfId = `user:${String(me.id)}`;

  const cached = await loadDataset(selfId);
  // Media refs aren't serializable, so a cached session renders stickers/gifs
  // from the persisted blob store only; peer refs rebuild with one cheap call
  // so profile photos always resolve.
  if (cached && cached.meta.messageCount > 0) {
    const peerRefs = await fetchPeerRefs(client).catch(
      () => new Map() as PeerRefs,
    );
    return {
      dataset: cached,
      mediaRefs: new Map(),
      peerRefs,
      hitRefs: new Map(),
    };
  }

  const result = await ingest(client, { onProgress });
  await saveDataset(result.dataset);
  return result;
}
