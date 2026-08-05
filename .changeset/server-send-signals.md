---
"better-tracking": minor
---

Server-originated conversions can now carry match signals: `SendOptions.signals`
threads vendor cookies/click ids into `relay.send()` (webhook purchases reach GA4
and improve Meta/LinkedIn/TikTok match quality), the GA4 sender accepts a
pre-derived `signals.ga_client_id` as an alternative to the raw `_ga` cookie, and
`signalsFromCookies()` extracts the relevant signal cookies from a Cookie header
or record server-side.
