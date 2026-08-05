# better-tracking

## 0.2.0

### Minor Changes

- 0edf921: v1.1 + v2: per-event dedup ids wired into pixels (Meta `eventID`, TikTok `event_id`, Reddit `conversionId`), match-signal collector and first-party relay beacon (`configure({ relay })`), `identify()` SHA-256 hashing for TikTok, opt-in Pinterest/Snap/Bing adapters via `use()`, `bt.debug.js` debug build, and the `better-tracking/server` relay (`createRelay`/`handle`/`send`) with Meta/GA4/TikTok/LinkedIn/Reddit/X senders, PII hash-at-ingest, bounded retry, GA4 fallback-only dedup, plus `better-tracking/next`, `better-tracking/tanstack-start`, and `toNodeHandler` integrations.
- 345f288: Server-originated conversions can now carry match signals: `SendOptions.signals`
  threads vendor cookies/click ids into `relay.send()` (webhook purchases reach GA4
  and improve Meta/LinkedIn/TikTok match quality), the GA4 sender accepts a
  pre-derived `signals.ga_client_id` as an alternative to the raw `_ga` cookie, and
  `signalsFromCookies()` extracts the relevant signal cookies from a Cookie header
  or record server-side.
