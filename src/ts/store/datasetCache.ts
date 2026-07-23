/**
 * IndexedDB persistence for the normalized `Dataset`, so reopening the app does
 * not re-fetch from Telegram and every stat module reads one shared source.
 * Also stores downloaded media/avatar blobs: Telegram file references only
 * live for the session that ingested them, so persisting the bytes lets a
 * cache-restored session still show images. Nothing ever leaves the device.
 * Guards for a missing `indexedDB` so importing this module is safe in
 * non-browser contexts (returns null / no-ops).
 */

import type { Dataset } from "../model/types";

const DB_NAME = "retrogram";
const DB_VERSION = 2;
const STORE = "datasets";
const BLOB_STORE = "blobs";

/**
 * Version of the ingest/normalization logic that produced a cached dataset.
 * Bump whenever ingestion or normalization changes what a `Dataset` contains
 * (e.g. media classification), so stale caches re-ingest instead of silently
 * serving data the fix never touched.
 */
const INGEST_VERSION = 4;

interface CachedEntry {
  version: number;
  dataset: Dataset;
}

function getIndexedDB(): IDBFactory | null {
  return typeof indexedDB !== "undefined" ? indexedDB : null;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const factory = getIndexedDB();
    if (!factory) {
      reject(new Error("IndexedDB unavailable"));
      return;
    }
    const request = factory.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
      if (!db.objectStoreNames.contains(BLOB_STORE)) {
        db.createObjectStore(BLOB_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("open failed"));
  });
}

function promisifyRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("request failed"));
  });
}

export async function saveDataset(dataset: Dataset): Promise<void> {
  if (!getIndexedDB()) return;
  const db = await openDb();
  try {
    const tx = db.transaction(STORE, "readwrite");
    const entry: CachedEntry = { version: INGEST_VERSION, dataset };
    await promisifyRequest(tx.objectStore(STORE).put(entry, dataset.self.id));
  } finally {
    db.close();
  }
}

export async function loadDataset(selfId: string): Promise<Dataset | null> {
  if (!getIndexedDB()) return null;
  const db = await openDb();
  try {
    const tx = db.transaction(STORE, "readonly");
    const result = (await promisifyRequest(
      tx.objectStore(STORE).get(selfId),
    )) as CachedEntry | Dataset | undefined;
    // Entries from before versioning (raw datasets) are stale by definition.
    const stale =
      !result || !("version" in result) || result.version !== INGEST_VERSION;
    if (stale) {
      // A version bump means the pipeline changed — start from a clean slate,
      // stored blobs included.
      if (result) await clearDataset();
      return null;
    }
    return result.dataset;
  } finally {
    db.close();
  }
}

export async function clearDataset(): Promise<void> {
  if (!getIndexedDB()) return;
  const db = await openDb();
  try {
    const tx = db.transaction([STORE, BLOB_STORE], "readwrite");
    await promisifyRequest(tx.objectStore(STORE).clear());
    await promisifyRequest(tx.objectStore(BLOB_STORE).clear());
  } finally {
    db.close();
  }
}

/** A downloaded image/clip, persisted so later sessions can render it. */
export interface StoredBlob {
  bytes: ArrayBuffer;
  type: string;
  video: boolean;
}

export async function saveBlob(key: string, blob: StoredBlob): Promise<void> {
  if (!getIndexedDB()) return;
  const db = await openDb();
  try {
    const tx = db.transaction(BLOB_STORE, "readwrite");
    await promisifyRequest(tx.objectStore(BLOB_STORE).put(blob, key));
  } finally {
    db.close();
  }
}

export async function loadBlob(key: string): Promise<StoredBlob | null> {
  if (!getIndexedDB()) return null;
  const db = await openDb();
  try {
    const tx = db.transaction(BLOB_STORE, "readonly");
    const result = await promisifyRequest(tx.objectStore(BLOB_STORE).get(key));
    return (result as StoredBlob | undefined) ?? null;
  } finally {
    db.close();
  }
}
