# Retrogram — Working Plan

Personal, 100% client-side Telegram analytics. You connect your **own** account and get "Wrapped"-style insights about your own usage.

## Concept & why it's legal

The whole design rests on a single distinction: **self-analysis, not surveillance.**

- **Data subject == user.** The person being analyzed is the person doing the analyzing, on their own account, with their own credentials. There is no third party whose data is being collected without consent.
- **Client-side-only means the developer is not a data controller.** Because messages are read, processed, and displayed entirely in the browser and never touch a server we run, we never "process" anyone's personal data under GDPR. No controller/processor obligations attach.
- **Contrast with the rejected idea.** The person-centric / OSINT direction (feed a handle, get someone else's groups and messages) was rejected as non-compliant: it profiles non-consenting third parties, relies on scraped or breached data, and makes the operator a controller of other people's data. Retrogram is the legally-clean inverse.
- **The bright line:** the day we add a backend that sees user data (cloud sync, server-side parsing, telemetry on message content), we take on full data-controller obligations. Keep everything in the browser.

## Auth decision

**QR login** (MTProto via gramjs), chosen deliberately:

- Over **export-file** import — QR is much better UX; no manual "export your data" dance.
- Over **phone + code** as the primary path — typing your login code into a web page is phishing-shaped and trains bad habits.

**Adaptive presentation of one login token:**

- gramjs surfaces a login token; the QR simply encodes `tg://login?token=<base64url>`.
- Render that token **two ways at once**:
  - **QR code** — scan from another device (e.g. phone scanning a desktop screen).
  - **"Open in Telegram" button** — the same `tg://login?token=…` as a tappable deep link, one tap, no scan.
- **Show the button on desktop too** (decision): desktop users often have Telegram Desktop installed, and the deep link opens it directly — no second device needed.
- **Phone + code** remains the universal fallback for anyone without the app / where the deep link is blocked.
- The login **token rotates (~30s)** — the QR and the button `href` must be re-rendered on each new token.

## Security caveats

- **The session token is full-account access.** Once linked, the session can do anything the account can. It is stored in `localStorage`.
- **Risks:** XSS or a compromised dependency could exfiltrate the token = full account takeover.
- **Mitigations:**
  - Pure client-side, no backend to breach.
  - Minimal, audited dependencies.
  - Open-source so users can verify "nothing leaves the browser."
  - Revocable: appears in Telegram → Settings → Devices; user can kill it anytime.
- **api_id / api_hash are public** in the bundle. Accepted — every web Telegram client exposes them. Technically against the letter of the Telegram API ToS but universally tolerated in practice.
- **FLOOD_WAIT handling required** — reading long histories will hit rate limits; need backoff and resumable paging.

## v1 feature scope (read-only analytics)

- Message volume over time (daily / weekly / monthly / yearly)
- Activity heatmap — hour-of-day × day-of-week
- Top contacts & chats (by messages, by words)
- Response-time patterns (who you reply to fastest, typical latency)
- Most-ghosted / dormant chats
- Word & emoji frequency
- Streaks & milestones
- Yearly **Wrapped** summary + shareable canvas cards

## Later

- Bulk cleanup / storage manager (needs **write** access via the live session — delete/leave/archive)
- Live refresh (re-sync without re-import)
- Saved-Messages notes / organizer
- Telegram **Mini App** wrapper for distribution

## Open questions / risks

- **gramjs-in-browser polyfills** — needs `Buffer` / `process` shims via `vite-plugin-node-polyfills`.
- **Large-history memory** — must stream / page rather than load everything into memory.
- **FLOOD_WAIT backoff** — graceful retry and progress UI for big accounts.
- **Mobile deep-link when app not installed** — fall back to phone + code.
- **Trademark / branding** — "not affiliated with Telegram" disclaimer; do not use the Telegram logo or imply endorsement.

## Status

- [x] Scaffold (Preact + Vite + TS strict, Lessly conventions)
- [ ] Login flow (QR + deep-link button + phone/code fallback) — stubbed
- [ ] MTProto session + history paging
- [ ] Analytics engine — TODO
- [ ] Dashboard UI — TODO
- [ ] Wrapped share cards — TODO
