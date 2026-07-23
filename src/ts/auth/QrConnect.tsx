import { useEffect, useState } from "preact/hooks";
import QRCode from "qrcode";

import { startQrLogin } from "./qrLogin";

import type { TelegramClient } from "telegram";

interface QrConnectProps {
  onConnected: (client: TelegramClient) => void;
}

/**
 * Connect screen. Renders the rotating `tg://login?token=...` token in two forms
 * at once — a scannable QR code and an "Open in Telegram" deep-link button — so it
 * works whether the user is scanning from a second device or has Telegram (Desktop
 * or mobile) on the same machine. A phone-number fallback covers the rest.
 */
export function QrConnect({ onConnected }: QrConnectProps) {
  const [loginUrl, setLoginUrl] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showPhoneFallback, setShowPhoneFallback] = useState(false);

  useEffect(() => {
    let cancelled = false;

    startQrLogin({
      onLoginUrl: (url) => {
        if (!cancelled) setLoginUrl(url);
      },
      onError: (err) => {
        if (!cancelled) setError(err.message);
        return false;
      },
      password: async () =>
        window.prompt("Enter your Telegram 2FA password") ?? "",
    })
      .then((client) => {
        if (!cancelled) onConnected(client);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [onConnected]);

  // Re-render the QR image whenever the token rotates (~30s).
  useEffect(() => {
    if (!loginUrl) return;
    QRCode.toDataURL(loginUrl, { width: 240, margin: 1 })
      .then(setQrDataUrl)
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : String(err)),
      );
  }, [loginUrl]);

  return (
    <section class="connect">
      <h2>Connect your Telegram</h2>

      {error && <p class="error">{error}</p>}

      <div class="qr-box">
        {qrDataUrl ? (
          <img
            src={qrDataUrl}
            alt="Telegram login QR code"
            width={240}
            height={240}
          />
        ) : (
          <p class="muted">Generating a secure login code…</p>
        )}
      </div>

      {loginUrl && (
        <a href={loginUrl} class="btn-primary">
          Open in Telegram
        </a>
      )}

      <p class="muted hint">
        Scan with Telegram → Settings → Devices → Link Desktop Device, or tap
        Open in Telegram.
      </p>

      <button
        type="button"
        class="link-button"
        onClick={() => setShowPhoneFallback((v) => !v)}
      >
        Log in with phone number instead
      </button>

      {showPhoneFallback && (
        <div class="phone-fallback">
          {/* TODO: phone + code fallback flow (sendCode → signIn → optional 2FA). */}
          <input type="tel" placeholder="+1 555 123 4567" disabled />
          <input type="text" placeholder="Login code" disabled />
          <p class="muted">Phone login is coming soon.</p>
        </div>
      )}
    </section>
  );
}
