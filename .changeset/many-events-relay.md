---
"better-tracking": minor
---

v1.1 + v2: per-event dedup ids wired into pixels (Meta `eventID`, TikTok `event_id`, Reddit `conversionId`), match-signal collector and first-party relay beacon (`configure({ relay })`), `identify()` SHA-256 hashing for TikTok, opt-in Pinterest/Snap/Bing adapters via `use()`, `bt.debug.js` debug build, and the `better-tracking/server` relay (`createRelay`/`handle`/`send`) with Meta/GA4/TikTok/LinkedIn/Reddit/X senders, PII hash-at-ingest, bounded retry, GA4 fallback-only dedup, plus `better-tracking/next`, `better-tracking/tanstack-start`, and `toNodeHandler` integrations.
