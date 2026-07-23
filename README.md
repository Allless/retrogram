# ◀◀ Retrogram

**Your Telegram, in review.**

[![CI](https://github.com/Allless/retrogram/actions/workflows/ci.yml/badge.svg)](https://github.com/Allless/retrogram/actions/workflows/ci.yml)
[![Deploy](https://github.com/Allless/retrogram/actions/workflows/deploy.yml/badge.svg)](https://github.com/Allless/retrogram/actions/workflows/deploy.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-b8441f.svg)](LICENSE)

Retrogram is a personal analytics tool for Telegram that runs entirely in the
browser. It logs into your account as a linked device, reads the last 12
months of your history locally, and presents the results as a slide deck.
There is no server and nothing is uploaded.

**Live**: https://allless.github.io/retrogram/ (will move to
`retrogram.lessly.me` once the domain is set up)

## Features

- Message volume per month (direct chats)
- Activity heatmap by weekday and hour
- Top DMs and top groups, with profile photos
- Response times: median reply time for both sides, and the chats where you
  or the other person take longest to reply
- Gone quiet: dormant conversations and who sent the last message
- Most-used emoji and most-used reactions, sent and received
- Greatest hits: your most-reacted messages, with photos and video frames
- Streaks: consecutive active days
- Top stickers and GIFs, animated where possible
- Share links: an anonymized summary anyone can open without logging in,
  with a per-section picker

## How it works

1. Log in with the QR code (desktop) or your phone number and a login code
   (mobile — Telegram's mobile apps don't confirm same-device QR links).
   Retrogram becomes a linked device on your account, like any Telegram
   client.
2. The last 12 months of history are fetched over MTProto and analyzed in
   the browser. Results are cached in IndexedDB, so reopening is instant.
3. The only network traffic goes to Telegram's servers.

## Privacy

- There is no backend. The site is static files on GitHub Pages, built from
  this repository by GitHub Actions. The page footer links the commit each
  deployment was built from.
- The session token is stored in localStorage. Disconnect deletes it, and
  you can revoke the session at any time in Telegram under Settings →
  Devices.
- No analytics, no tracking, no third-party requests.
- The code is MIT-licensed. Run it locally if you prefer.

## FAQ

**How do I know this isn't stealing my account?**
You don't have to take it on trust. There is no server that could receive
anything: watch the network tab during login and ingestion, and every
request goes to Telegram. The deployed site is built by CI from this
repository, and the footer links the exact commit it was built from.

**Why does it need my login? Telegram has an export feature.**
The official export requires the desktop app and can involve a 24-hour
security delay. A web page can only read history through MTProto, by
becoming a linked device, which is how every third-party Telegram client
works.

**What can the session access?**
Everything. A linked device is equivalent to logging in on a new phone.
Revoke it at any time in Telegram under Settings → Devices → Terminate.

**Is my 2FA password sent anywhere?**
No. Telegram's two-step verification uses SRP: the password is used locally
to compute a proof and is never transmitted.

**Will Telegram notify me about the login?**
Yes, you get the standard new-device notification.

**The API key is visible in the bundle. Isn't that a problem?**
No. The `api_id`/`api_hash` pair identifies the application, not the user,
and is present in every distributed Telegram client. If you self-host,
register your own pair at https://my.telegram.org.

**How do share links work without a server?**
The summary contains aggregate numbers only; names and message content stay
out unless you opt in. It is encrypted with AES-GCM in the browser and
posted anonymously to [Telegraph](https://telegra.ph), Telegram's publishing
service. The decryption key is carried in the URL fragment, which browsers
never send to servers. Anyone with the link can view the report without
logging in. Telegraph makes no permanence guarantees, so treat share links
as temporary.

**Why only 12 months, and why are large chats truncated?**
Telegram rate-limits history reads. The defaults (12 months, 5,000 messages
per chat) keep ingestion to a few minutes. Both constants are in
`src/ts/ingestion/ingest.ts` if you self-host.

## Stack

- [Preact](https://preactjs.com) — UI
- [gramjs](https://github.com/gram-js/gramjs) (`telegram`) — MTProto client,
  runs in the browser over WebSocket
- [qrcode](https://github.com/soldair/node-qrcode) — login QR rendering
- Vite, TypeScript (strict), Vitest

## Development

```sh
pnpm install
pnpm dev           # dev server on localhost:5173
pnpm test          # run tests
pnpm build         # production build to dist/
```

Copy `.env.example` to `.env` and fill in your Telegram API credentials
from https://my.telegram.org:

```sh
cp .env.example .env
```

The credentials end up in the client bundle, which is normal for web-based
Telegram clients; see the FAQ.

## License

[MIT](LICENSE)

## Disclaimer

Retrogram is not affiliated with, endorsed by, or sponsored by Telegram.
"Telegram" is a trademark of its respective owner.
