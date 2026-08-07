import { useMemo, useState } from "preact/hooks";

import { extractUploads } from "./extract";
import { parseWhatsappExport } from "./parse";
import { buildWhatsappDataset, type ParsedExport } from "./build";

import type { Dataset } from "../../model/types";

interface ConnectProps {
  onReady: (dataset: Dataset, skippedConflicts: string[]) => void;
}

/**
 * WhatsApp connect screen: drop chat exports (.txt, or .zip per the intake
 * rules), confirm which participant is you, done. Everything is parsed
 * locally; files never leave the device.
 */
export function WhatsappConnect({ onReady }: ConnectProps) {
  const [exports, setExports] = useState<ParsedExport[]>([]);
  const [skipped, setSkipped] = useState<string[]>([]);
  const [selfName, setSelfName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const addFiles = async (list: FileList | null) => {
    if (!list || list.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const files = await Promise.all(
        Array.from(list).map(async (f) => ({
          name: f.name,
          bytes: new Uint8Array(await f.arrayBuffer()),
        })),
      );
      const result = extractUploads(files);
      const parsed = result.texts
        .map((t) => ({ fileName: t.name, chat: parseWhatsappExport(t.text) }))
        .filter((p) => p.chat.messages.length > 0);
      if (parsed.length === 0 && result.skipped.length === 0) {
        setError("No WhatsApp chat exports found in those files.");
      }
      setExports((prev) => [...prev, ...parsed]);
      setSkipped((prev) => [...prev, ...result.skipped]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  // Sender tallies across all uploads; the self-guess is the only participant
  // present in every chat (with several chats that's almost always you).
  const participants = useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of exports) {
      for (const m of e.chat.messages) {
        counts.set(m.sender, (counts.get(m.sender) ?? 0) + 1);
      }
    }
    const everywhere = [...counts.keys()].filter((name) =>
      exports.every((e) => e.chat.participants.includes(name)),
    );
    return {
      list: [...counts.entries()].sort((a, b) => b[1] - a[1]),
      guess:
        exports.length > 1 && everywhere.length === 1 ? everywhere[0] : null,
    };
  }, [exports]);

  const chosen = selfName ?? participants.guess;

  const connect = () => {
    if (!chosen) return;
    const { dataset, skippedConflicts } = buildWhatsappDataset(exports, chosen);
    onReady(dataset, skippedConflicts);
  };

  return (
    <section class="connect">
      <h2>
        Connect your WhatsApp <span class="beta-badge">beta</span>
      </h2>

      <p class="muted hint">
        In WhatsApp, open a chat → ⋮ → More → Export chat (without media) and
        share the file to this device. Repeat for your main chats — every file
        you add makes the rewind more complete.
      </p>

      {error && <p class="error">{error}</p>}

      <label
        class={dragOver ? "dropzone dropzone-active" : "dropzone"}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const files = e.dataTransfer?.files ?? null;
          if (!files || files.length === 0) {
            // e.g. VS Code's explorer drags a path, not file contents.
            setError(
              "That drag didn't carry file contents — drag from your file manager, or click the box to choose files.",
            );
            return;
          }
          void addFiles(files);
        }}
      >
        <input
          type="file"
          multiple
          accept=".txt,.zip"
          class="dropzone-input"
          disabled={busy}
          onChange={(e) => {
            void addFiles(e.currentTarget.files);
            e.currentTarget.value = "";
          }}
        />
        {busy
          ? "Reading…"
          : exports.length === 0
            ? "Drop exports here, or click to choose (.txt or .zip)"
            : "Add more chats"}
      </label>

      {exports.length > 0 && (
        <ul class="upload-list muted hint">
          {exports.map((e) => (
            <li key={e.fileName}>
              {e.fileName} · {e.chat.messages.length.toLocaleString()} messages
              {e.chat.dateOrderAmbiguous ? " · ⚠ ambiguous dates" : ""}
            </li>
          ))}
        </ul>
      )}

      {skipped.length > 0 && (
        <ul class="upload-list muted hint">
          {skipped.map((s) => (
            <li key={s}>skipped: {s}</li>
          ))}
        </ul>
      )}

      {exports.length > 0 && (
        <div class="self-picker">
          <p class="muted hint">Which participant is you?</p>
          {participants.list.map(([name, count]) => (
            <label key={name} class="self-option">
              <input
                type="radio"
                name="wa-self"
                checked={name === chosen}
                onChange={() => setSelfName(name)}
              />{" "}
              {name} <span class="muted">({count.toLocaleString()} msgs)</span>
            </label>
          ))}
        </div>
      )}

      <button
        type="button"
        class="btn-primary"
        disabled={!chosen || busy || exports.length === 0}
        onClick={connect}
      >
        Rewind{" "}
        {exports.length > 0
          ? `${exports.length} chat${exports.length > 1 ? "s" : ""}`
          : ""}
      </button>

      <p class="muted hint trust-note">
        Your exports are parsed in this browser tab and never uploaded — there
        is no server to upload to.
      </p>
    </section>
  );
}
