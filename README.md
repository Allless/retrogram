# ◀◀ Retrogram

**Your Telegram, in review.**

[![CI](https://github.com/Allless/retrogram/actions/workflows/ci.yml/badge.svg)](https://github.com/Allless/retrogram/actions/workflows/ci.yml)
[![Deploy](https://github.com/Allless/retrogram/actions/workflows/deploy.yml/badge.svg)](https://github.com/Allless/retrogram/actions/workflows/deploy.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-b8441f.svg)](LICENSE)

100% client-side personal Telegram analytics. Connect your own account and flip
through your year as slides — busiest chats, activity patterns, response times,
who ghosts whom — computed entirely in your browser. No upload, no signup, no
server.

**Live**: https://allless.github.io/retrogram/ (moving to `retrogram.lessly.me`
once the domain is set up)

## What you get

One slide per stat, story-style:

- **Message volume** — DMs sent/received per month
- **Activity heatmap** — when you're chatting, by weekday × hour
- **Top DMs** and **Top groups** — ranked separately, with real profile photos
- **Response times** — your median vs. theirs, plus a ghosting coefficient:
  who leaves _you_ hanging, and who _you_ leave hanging (reply-time asymmetry,
  weighted by chat size)
- **Gone quiet** — conversations that went dormant, and who spoke last
- **Most-used emoji** — the emoji you actually send (full sequences: 👨‍👩‍👧 stays one emoji)
- **Streaks** — longest daily-chatting runs
- **Top stickers & GIFs** — the ones you send most, animated where possible

## How it works

1. **Connect your account.** On desktop: scan the QR code, or tap _Open in
   Telegram_ if you have Telegram Desktop. On mobile: log in with phone number
   - login code (Telegram's mobile apps intentionally don't confirm same-device
     QR deep links).
2. gramjs opens an **MTProto session in the browser** — you become a linked
   device on your own account.
3. The last 12 months of your history are read and analyzed **locally**, then
   cached in IndexedDB so reopening is instant.
4. Flip through the slides.

Your data never leaves the browser. Everything runs on your machine.

## Privacy — don't take our word for it

- **100% client-side.** There is no backend. The only network requests go to
  Telegram's own servers — open DevTools → Network and check.
- **Your session stays with you.** The session token lives in `localStorage`
  on your device. Revoke it anytime in **Telegram → Settings → Devices** —
  Retrogram shows up there as a linked device like any other.
- **Verifiable builds.** The site is built and deployed from this repository
  by GitHub Actions; the page footer links the exact commit it was built from.
- **Open source (MIT).** Audit the code, fork it, or run it locally.

## Stack

- **Preact** — UI framework
- **gramjs** (`telegram`) — MTProto client over WebSocket, runs in the browser
- **qrcode** — renders the login QR client-side
- **Vite** — build tool
- **TypeScript** — strict mode

## Development

```sh
pnpm install
pnpm dev           # dev server on localhost:5173
pnpm test          # run tests
pnpm build         # production build to dist/
```

Before running, copy `.env.example` to `.env` and fill in your Telegram API
credentials:

```sh
cp .env.example .env
# VITE_TG_API_ID and VITE_TG_API_HASH — get them from https://my.telegram.org
```

These credentials are baked into the client bundle (as with any web-based
Telegram client) and are not secret.

## License

[MIT](LICENSE)

## Disclaimer

Retrogram is not affiliated with, endorsed by, or sponsored by Telegram.
"Telegram" is a trademark of its respective owner.
