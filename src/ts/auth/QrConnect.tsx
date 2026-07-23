import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import QRCode from "qrcode";

import { startPhoneLogin, startQrLogin } from "./qrLogin";
import { REPO_URL } from "../links";

import type { TelegramClient } from "telegram";

interface QrConnectProps {
  onConnected: (client: TelegramClient) => void;
}

type Mode = "qr" | "phone";
type PhoneStep = "phone" | "code" | "password";

const PHONE_STEP_UI: Record<
  PhoneStep,
  { label: string; placeholder: string; button: string; hint: string }
> = {
  phone: {
    label: "Phone number",
    placeholder: "+1 555 123 4567",
    button: "Send code",
    hint: "International format. Telegram will message you a login code.",
  },
  code: {
    label: "Login code",
    placeholder: "12345",
    button: "Sign in",
    hint: "Check your Telegram app (or SMS) for the code.",
  },
  password: {
    label: "Two-step password",
    placeholder: "2FA password",
    button: "Verify",
    hint: "Your account has two-step verification enabled.",
  },
};

/**
 * Telegram mobile apps refuse to confirm a same-device `tg://login` deep link
 * (anti-phishing) — they just show a "how to scan QR codes" sheet. On these
 * platforms phone login is the flow that actually works.
 */
function detectMobile(): boolean {
  const iPadOs =
    navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || iPadOs;
}

/**
 * Connect screen with two flows. Desktop defaults to the rotating QR code
 * (scannable, or one tap with Telegram Desktop installed); mobile defaults to
 * phone-number login. Each flow can be switched to manually.
 */
export function QrConnect({ onConnected }: QrConnectProps) {
  const isMobile = useMemo(detectMobile, []);
  const [mode, setMode] = useState<Mode>(isMobile ? "phone" : "qr");
  const [error, setError] = useState<string | null>(null);

  // QR flow state.
  const [loginUrl, setLoginUrl] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  // Phone flow state. gramjs drives the flow by awaiting callbacks; the form
  // resolves the pending one on submit. Bumping `phoneAttempt` abandons the
  // current flow and starts a fresh one (e.g. after a mistyped number).
  const [phoneStep, setPhoneStep] = useState<PhoneStep>("phone");
  const [phoneAttempt, setPhoneAttempt] = useState(0);
  const [inputValue, setInputValue] = useState("");
  const [busy, setBusy] = useState(true);
  const pendingInput = useRef<((value: string) => void) | null>(null);

  useEffect(() => {
    if (mode !== "qr") return;
    let cancelled = false;
    let succeeded = false;
    let client: TelegramClient | null = null;

    setError(null);
    setLoginUrl(null);
    setQrDataUrl(null);

    startQrLogin({
      onClient: (c) => {
        client = c;
      },
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
      .then((connected) => {
        succeeded = true;
        if (!cancelled) onConnected(connected);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      });

    return () => {
      cancelled = true;
      // Abandoned flow (mode switch/unmount) — stop the token rotation.
      if (!succeeded) void client?.disconnect().catch(() => undefined);
    };
  }, [mode, onConnected]);

  useEffect(() => {
    if (mode !== "phone") return;
    let cancelled = false;
    let succeeded = false;
    let client: TelegramClient | null = null;

    setError(null);
    setPhoneStep("phone");
    setInputValue("");
    setBusy(true);
    pendingInput.current = null;

    const waitForInput = (step: PhoneStep) =>
      new Promise<string>((resolve) => {
        if (cancelled) return;
        pendingInput.current = resolve;
        setPhoneStep(step);
        setBusy(false);
      });

    startPhoneLogin({
      onClient: (c) => {
        client = c;
      },
      phoneNumber: () => waitForInput("phone"),
      phoneCode: () => waitForInput("code"),
      password: () => waitForInput("password"),
      onError: (err) => {
        if (!cancelled) {
          setError(err.message);
          setBusy(false);
        }
        return false;
      },
    })
      .then((connected) => {
        succeeded = true;
        if (!cancelled) onConnected(connected);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
          setBusy(false);
        }
      });

    return () => {
      cancelled = true;
      if (!succeeded) void client?.disconnect().catch(() => undefined);
    };
  }, [mode, phoneAttempt, onConnected]);

  // Re-render the QR image whenever the token rotates (~30s).
  useEffect(() => {
    if (!loginUrl) return;
    QRCode.toDataURL(loginUrl, { width: 240, margin: 1 })
      .then(setQrDataUrl)
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : String(err)),
      );
  }, [loginUrl]);

  const submitPhoneStep = (event: Event) => {
    event.preventDefault();
    const value = inputValue.trim();
    const resolve = pendingInput.current;
    if (!value || !resolve) return;
    pendingInput.current = null;
    setInputValue("");
    setError(null);
    setBusy(true);
    resolve(value);
  };

  const stepUi = PHONE_STEP_UI[phoneStep];

  return (
    <section class="connect">
      <h2>Connect your Telegram</h2>

      {error && <p class="error">{error}</p>}

      {mode === "qr" && (
        <>
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

          {loginUrl && !isMobile && (
            <a href={loginUrl} class="btn-primary">
              Open in Telegram
            </a>
          )}

          <p class="muted hint">
            {isMobile
              ? "Scan this from another device: Telegram → Settings → Devices → Link Desktop Device."
              : "Scan with Telegram → Settings → Devices → Link Desktop Device, or tap Open in Telegram (desktop app)."}
          </p>

          <button
            type="button"
            class="link-button"
            onClick={() => setMode("phone")}
          >
            Log in with phone number instead
          </button>
        </>
      )}

      {mode === "phone" && (
        <>
          <form class="phone-fallback" onSubmit={submitPhoneStep}>
            <label class="muted hint" for="phone-step-input">
              {stepUi.label}
            </label>
            <input
              id="phone-step-input"
              key={phoneStep}
              type={
                phoneStep === "password"
                  ? "password"
                  : phoneStep === "phone"
                    ? "tel"
                    : "text"
              }
              inputMode={phoneStep === "code" ? "numeric" : undefined}
              autocomplete={phoneStep === "code" ? "one-time-code" : undefined}
              placeholder={stepUi.placeholder}
              value={inputValue}
              onInput={(e) => setInputValue(e.currentTarget.value)}
              disabled={busy}
            />
            <button type="submit" class="btn-primary" disabled={busy}>
              {busy ? "Connecting…" : stepUi.button}
            </button>
            <p class="muted hint">{stepUi.hint}</p>
          </form>

          {phoneStep !== "phone" && (
            <button
              type="button"
              class="link-button"
              onClick={() => setPhoneAttempt((n) => n + 1)}
            >
              Start over with a different number
            </button>
          )}

          <button
            type="button"
            class="link-button"
            onClick={() => setMode("qr")}
          >
            Use a QR code instead{isMobile ? " (needs a second device)" : ""}
          </button>
        </>
      )}

      <p class="muted hint trust-note">
        Retrogram is open-source and has no server — it runs entirely in this
        browser tab. Your login talks only to Telegram's own API, and your
        session never leaves this device. Don't take our word for it:{" "}
        <a href={REPO_URL} target="_blank" rel="noopener noreferrer">
          read the source
        </a>{" "}
        or watch the network tab.
      </p>

      <details class="trust-details">
        <summary>Is this safe?</summary>
        <ul>
          <li>
            The only network requests go to Telegram's servers — there is
            nothing else to send data to. Open DevTools → Network and check.
          </li>
          <li>
            Your session key is stored in this browser's localStorage only.
            Disconnect wipes it.
          </li>
          <li>
            You can revoke this device anytime in Telegram → Settings → Devices.
          </li>
          <li>
            This site is built and deployed automatically from the{" "}
            <a href={REPO_URL} target="_blank" rel="noopener noreferrer">
              public repository
            </a>{" "}
            by GitHub Actions — what you're running is what's on GitHub.
          </li>
          <li>Independent project, not affiliated with Telegram.</li>
        </ul>
      </details>
    </section>
  );
}
