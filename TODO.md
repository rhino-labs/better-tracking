# TODO

Tracks work against [PRD.md](PRD.md). Status as of 2026-08-02.

## Done (v1 — M1/M2 scope)

- [x] Core engine: detector (init + retry ticks + re-probe on track), queue with per-vendor replay, consent gate (incl. 500ms pending poll), emitter, SPA history patching
- [x] Adapters: Meta, GA4 (gtag + dataLayer fallback), TikTok, LinkedIn, Reddit, X with per-vendor param translation
- [x] Mapping table (`as const satisfies`), config.map overrides, own-property guards
- [x] Strict typing: EventMap with conditional param tuples, declaration merging, typed config/emitter, zero `any`; type tests (`test-d`)
- [x] IIFE build with command-queue stub replay, allowlisted + guarded dispatch, global `bt` declaration
- [x] Builds: ESM + per-adapter subpaths + IIFE, size-limit gate (3KB; currently 1.88/2.07KB brotli)
- [x] Tests: 26 unit + type tests; lint (no-any/no-non-null); publint + attw clean; pack smoke test into consumer fixture
- [x] Publishing scaffolding: exports map, changesets, CI + release workflows (OIDC/provenance), LICENSE, README, prepublishOnly guard
- [x] Post-review hardening (prototype-key mapping, queue eviction policy, skip-replay on configure, consent poll, deferred init probe, IIFE hardening)

## v1 remaining (PRD M3)

- [ ] `git init`, initial commit, GitHub repo; add repo to npm trusted publishers
- [ ] First changeset + publish `0.1.0` to npm
- [ ] Playwright integration matrix: real vendor snippets (network-stubbed), late-load permutations (pixel before/after init, after first track, GTM-injected)
- [ ] Live smoke page with all six pixels (test accounts) for manual verification with vendor pixel-helper extensions
- [ ] Weekly cron CI run of the Playwright suite (vendor snippet drift detection)
- [ ] Docs site (can start as README-only)

## v1.1 (PRD §10)

- [ ] `identify()` PII hashing (SHA-256 via SubtleCrypto) for vendors with identity APIs (TikTok, Reddit advanced matching); GA4 user_id already wired
- [ ] Additional opt-in adapters: Pinterest (`pintrk`), Snap (`snaptr`), Microsoft/Bing (`uetq`)
- [ ] Debug build (`bt.debug.js`) with rich dispatch tables and "pixel found but unconfigured" hints

## v2 — server-side events (PRD §12)

- [ ] Client: `event_id` on every event, wired into pixel dedup fields (Meta `eventID`, TikTok `event_id`, …)
- [ ] Client: match-signal collector (vendor cookies, click ids captured at init) + `relay` beacon transport (`sendBeacon` → `fetch keepalive`), `relay`/`relay-error` emitter events
- [ ] Server: `better-tracking/server` — `createRelay`, `handle(Request)`, `send()`; validation, PII normalization + hashing, per-vendor senders (Meta, GA4, TikTok first), bounded retry, allSettled fan-out, test-event codes
- [ ] Framework integrations (§12.5): `better-tracking/next`, `better-tracking/tanstack-start` (Tier 1 wrappers + CI fixture smoke tests); Tier-2 recipes; `toNodeHandler` shim
- [ ] Dedup policy incl. GA4 fallback-only default (§12.7)
- [ ] Server CI leg: Node 18/20/22 + workerd; nightly sandbox tests against vendor validation endpoints
- [ ] LinkedIn/Reddit/X senders (v2.1), incl. dependency-free OAuth 1.0a signer for X

## Open questions (need Ryan's call)

- [ ] PRD §11: GTM-only GA4 approach (current impl pushes to dataLayer — confirm), bundle growth policy, canonical vocabulary naming, 3KB vs 2KB budget
- [ ] PRD §12.10: relay batching scope, LinkedIn token refresh ownership, monorepo split threshold
