/**
 * Upload intake: turns the user's selection of .txt / .zip files into chat
 * export texts. Zip layout rule: an uploaded zip contains chat .txt files
 * and/or leaf zips, where a leaf zip must contain exactly one .txt (the
 * shape WhatsApp bulk exports produce). Media and archive junk entries
 * (__MACOSX, dotfiles) are ignored; anything unusable is reported, not
 * silently dropped.
 */

import { unzipSync } from "fflate";

export interface ExtractedText {
  name: string; // base filename, e.g. "WhatsApp Chat with L.txt"
  text: string;
}

export interface ExtractResult {
  texts: ExtractedText[];
  skipped: string[]; // human-readable reasons
}

const decoder = new TextDecoder();
const isTxt = (name: string) => /\.txt$/i.test(name);
const isZip = (name: string) => /\.zip$/i.test(name);
const isJunk = (name: string) =>
  name.endsWith("/") || /(^|\/)(__MACOSX\/|\.)/.test(name);
const baseName = (name: string) => name.split("/").pop() ?? name;

export function extractUploads(
  files: { name: string; bytes: Uint8Array }[],
): ExtractResult {
  const texts: ExtractedText[] = [];
  const skipped: string[] = [];

  for (const file of files) {
    if (isTxt(file.name)) {
      texts.push({
        name: baseName(file.name),
        text: decoder.decode(file.bytes),
      });
    } else if (isZip(file.name)) {
      extractZip(file.name, file.bytes, texts, skipped);
    } else {
      skipped.push(`${file.name} — unsupported file type`);
    }
  }
  return { texts, skipped };
}

function extractZip(
  zipName: string,
  bytes: Uint8Array,
  texts: ExtractedText[],
  skipped: string[],
): void {
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(bytes);
  } catch {
    skipped.push(`${zipName} — unreadable zip`);
    return;
  }

  let found = 0;
  for (const [entryName, data] of Object.entries(entries)) {
    if (isJunk(entryName)) continue;

    if (isTxt(entryName)) {
      texts.push({ name: baseName(entryName), text: decoder.decode(data) });
      found++;
    } else if (isZip(entryName)) {
      // Leaf zip: must hold exactly one chat .txt.
      let leaf: Record<string, Uint8Array>;
      try {
        leaf = unzipSync(data);
      } catch {
        skipped.push(`${zipName}/${entryName} — unreadable zip`);
        continue;
      }
      const inner = Object.entries(leaf).filter(
        ([name]) => !isJunk(name) && isTxt(name),
      );
      if (inner.length !== 1) {
        skipped.push(
          `${zipName}/${entryName} — expected exactly one .txt, found ${inner.length}`,
        );
        continue;
      }
      texts.push({
        name: baseName(inner[0][0]),
        text: decoder.decode(inner[0][1]),
      });
      found++;
    }
    // Other entries (exported media files) are expected; ignore silently.
  }

  if (found === 0) {
    skipped.push(`${zipName} — no chat .txt or leaf zips inside`);
  }
}
