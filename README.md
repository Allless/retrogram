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
- **Reactions** — the emoji you react with, and the ones you get back
- **Greatest hits** — your most-reacted messages, media rendered inline
- **Streaks** — longest daily-chatting runs
- **Top stickers & GIFs** — the ones you send most, animated where possible
- **Share your year** — an anonymized, encrypted share link; you pick which
  sections it includes (see the FAQ for how that works without a server)

## How it works

1. **Connect your account.** On desktop: scan the QR code, or tap _Open in
   Telegram_ if you have Telegram Desktop. On mobile: log in with your phone
   number and a login code (Telegram's mobile apps intentionally don't confirm
   same-device QR deep links).
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

## FAQ

**Isn't logging into a random website with my Telegram account exactly what
a phishing scam looks like?**
Healthy instinct — that's why nothing here asks you to take anything on
faith. Retrogram has no server: the page is static files on GitHub Pages,
built by CI from this repository (the footer links the exact commit). Your
login handshake goes directly from your browser to Telegram's servers over
MTProto — open DevTools → Network and verify there is nowhere else data
could go.

**Why does it need a login at all? Couldn't it use Telegram's export?**
Telegram's official export requires the desktop app and often a 24-hour
security wait. A browser has exactly one way to read your history: become a
linked device via MTProto — the same official API every third-party Telegram
client uses. That's the trade this tool makes, openly.

**What can the session access, and how do I kill it?**
A linked device has full account access — same as logging in on a new phone.
The session token is stored only in your browser's localStorage; Disconnect
deletes it locally, and **Telegram → Settings → Devices → Retrogram →
Terminate** revokes it server-side at any time.

**Is my 2FA password safe to type here?**
Telegram uses SRP for two-step verification: the password is used locally to
compute a proof — it is not transmitted, not even to Telegram.

**Will Telegram email me about a new login?**
Yes — you'll get the standard "new device" notification, like any new login.
That's Telegram working as intended.

**Why do all users share one API id? Isn't that a secret?**
An `api_id`/`api_hash` pair identifies the _application_, not the user, and
ships inside every distributed Telegram client — official ones included.
It's not a secret and grants nothing by itself. If you self-host, register
your own at my.telegram.org.

**How can share links work if there's no server?**
The summary (aggregate numbers only — no names, no messages, unless you
explicitly opt in) is encrypted in your browser with AES-GCM and posted
anonymously to [Telegraph](https://telegra.ph), Telegram's own pastebin. The
decryption key travels only in the link's `#fragment`, which browsers never
send to any server. Viewers need no login and no Telegram account. Links are
best-effort: Telegraph makes no permanence promises.

**Why only the last 12 months / why is my biggest chat capped?**
Telegram aggressively rate-limits history reads (`FLOOD_WAIT`). One year and
5,000 messages per chat keeps ingest to minutes instead of hours; the caps
live in `src/ts/ingestion/ingest.ts` if you self-host and want more.

**Can I run it myself?**
Yes — see Development below. Your own API keys, your own GitHub Pages fork,
no infrastructure needed.

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
