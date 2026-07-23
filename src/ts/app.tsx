import { useState } from "preact/hooks";

import { QrConnect } from "./auth/QrConnect";
import { clearSession } from "./auth/qrLogin";
import { Dashboard } from "./dashboard/Dashboard";
import { fetchPeerRefs, ingest } from "./ingestion/ingest";
import { clearDataset, loadDataset, saveDataset } from "./store/datasetCache";
import { REPO_URL } from "./links";

import type { MediaRefs, PeerRefs } from "./ingestion/ingest";
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
  const [progress, setProgress] = useState<Progress | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleConnected = async (connected: TelegramClient) => {
    setStatus("loading");
    setError(null);
    setClient(connected);
    try {
      const {
        dataset: data,
        mediaRefs: refs,
        peerRefs: peers,
      } = await loadOrIngest(connected, setProgress);
      setDataset(data);
      setMediaRefs(refs);
      setPeerRefs(peers);
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
    setError(null);
    setStatus("connect");
  };

  // Media downloads need a live client; the refs only exist after a fresh
  // ingest (a cache-restored dataset shows fallbacks instead).
  const media = client ? { client, refs: mediaRefs, peers: peerRefs } : null;

  return (
    <div class="app">
      <header class="app-header">
        <h1 class="wordmark">
          <span class="wordmark-rewind" aria-hidden="true">
            ◀◀
          </span>
          Retrogram
        </h1>
        <p class="tagline">Your Telegram, in review — 100% in your browser</p>
      </header>

      <main>
        {status === "connect" && <QrConnect onConnected={handleConnected} />}

        {status === "loading" && (
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

        {status === "error" && (
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

        {status === "ready" && dataset && (
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

/** Reuse the cached dataset for this account if present, else ingest and cache. */
async function loadOrIngest(
  client: TelegramClient,
  onProgress: (p: Progress) => void,
): Promise<{ dataset: Dataset; mediaRefs: MediaRefs; peerRefs: PeerRefs }> {
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
    return { dataset: cached, mediaRefs: new Map(), peerRefs };
  }

  const { dataset, mediaRefs, peerRefs } = await ingest(client, { onProgress });
  await saveDataset(dataset);
  return { dataset, mediaRefs, peerRefs };
}
