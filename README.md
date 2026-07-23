# Retrogram

Your Telegram, in review.

100% client-side personal Telegram analytics. Connect your own account and see your stats — busiest chats, activity patterns, response times, a yearly "Wrapped" — computed entirely in your browser. No upload, no signup, no server.

**Live**: https://allless.github.io/retrogram/ (moving to `retrogram.lessly.me` once the domain is set up)

## Stack

- **Preact** — UI framework
- **gramjs** (`telegram`) — MTProto client over WebSocket, runs in the browser
- **qrcode** — renders the login QR client-side
- **Vite** — build tool
- **TypeScript** — strict mode

## How it works

1. Connect your account — scan the **QR code**, tap **Open in Telegram** (same login token as a `tg://` deep link), or use the **phone + code** fallback
2. gramjs opens an **MTProto session in the browser** — you become a linked device on your own account
3. Your own message history is read and analyzed **locally**
4. Explore the dashboard and export shareable **Wrapped** cards

Your data never leaves the browser. Everything runs on your machine.

## Privacy

- **100% client-side.** There is no backend. Your messages are never uploaded, and there is no telemetry or analytics on you.
- **Your session stays with you.** The session token lives in `localStorage` on your device. You can revoke it anytime in **Telegram → Settings → Devices** — Retrogram shows up there as a linked device like any other.
- **Open source.** The client is auditable, so you can verify that nothing is sent anywhere.

## Development

```sh
pnpm install
pnpm dev           # dev server on localhost:5173
pnpm test          # run tests
pnpm build         # production build to dist/
```

Before running, copy `.env.example` to `.env` and fill in your Telegram API credentials:

```sh
cp .env.example .env
# VITE_TG_API_ID and VITE_TG_API_HASH — get them from https://my.telegram.org
```

These credentials are baked into the client bundle (as with any web-based Telegram client) and are not secret.

## Disclaimer

Retrogram is not affiliated with, endorsed by, or sponsored by Telegram. "Telegram" is a trademark of its respective owner.
