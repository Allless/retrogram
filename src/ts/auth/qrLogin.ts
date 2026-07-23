/**
 * MTProto QR-login orchestration (gramjs).
 *
 * SECURITY: the session string produced here is *full-account access* to the
 * user's Telegram — equivalent to a logged-in device. It is persisted only to
 * this browser's localStorage and must NEVER be uploaded, logged, or leave the
 * device. Retrogram is 100% client-side precisely so this token stays local.
 *
 * gramjs and its Node polyfills are imported lazily *inside* the function so the
 * rest of the app (and the pure `loginLink` layer) does not hard-crash at import
 * time if the browser polyfills are unavailable.
 */
import type { TelegramClient } from "telegram";

import { buildLoginLink } from "./loginLink";

const SESSION_STORAGE_KEY = "retrogram.session";

const API_ID = Number(import.meta.env.VITE_TG_API_ID);
const API_HASH = String(import.meta.env.VITE_TG_API_HASH ?? "");

export interface QrLoginOptions {
  /** Called with a fresh `tg://login?token=...` URL each time the token rotates. */
  onLoginUrl: (url: string) => void;
  /** Called on a login error. Return `true` to stop retrying, `false` to continue. */
  onError: (err: Error) => Promise<boolean> | boolean;
  /** Supplies the 2FA password when the account has one set. */
  password?: () => Promise<string>;
}

/**
 * Start the QR-login flow. Resolves with the connected client once the user has
 * authorized the session from their Telegram app.
 */
export async function startQrLogin(
  opts: QrLoginOptions,
): Promise<TelegramClient> {
  if (!API_ID || !API_HASH) {
    throw new Error(
      "Missing VITE_TG_API_ID / VITE_TG_API_HASH — register an app at my.telegram.org.",
    );
  }

  const { TelegramClient } = await import("telegram");
  const { StringSession } = await import("telegram/sessions");

  const session = new StringSession(loadSavedSession() ?? "");
  const client = new TelegramClient(session, API_ID, API_HASH, {
    connectionRetries: 5,
  });

  await client.connect();

  // Resume silently if the stored session is still authorized — no QR needed.
  if (await client.checkAuthorization()) {
    persistSession(client.session.save());
    return client;
  }

  await client.signInUserWithQrCode(
    { apiId: API_ID, apiHash: API_HASH },
    {
      qrCode: async (code) => opts.onLoginUrl(buildLoginLink(code.token)),
      onError: async (err) => opts.onError(err),
      password: opts.password,
    },
  );

  persistSession(client.session.save());
  return client;
}

/** Read the saved session string, or `null` if none is stored. */
export function loadSavedSession(): string | null {
  return localStorage.getItem(SESSION_STORAGE_KEY);
}

/** Remove the saved session (log out locally). */
export function clearSession(): void {
  localStorage.removeItem(SESSION_STORAGE_KEY);
}

function persistSession(session: unknown): void {
  if (typeof session === "string" && session.length > 0) {
    localStorage.setItem(SESSION_STORAGE_KEY, session);
  }
}
