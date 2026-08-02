# TODO

Tracks work against [PRD.md](PRD.md). Status as of 2026-08-02 (evening).

## Done (v1 — M1/M2 scope)

- [x] Core engine: detector (init + retry ticks + re-probe on track), queue with per-vendor replay, consent gate (incl. 500ms pending poll), emitter, SPA history patching
- [x] Adapters: Meta, GA4 (gtag + dataLayer fallback), TikTok, LinkedIn, Reddit, X with per-vendor param translation
- [x] Mapping table (`as const satisfies`), config.map overrides, own-property guards
- [x] Strict typing: EventMap with conditional param tuples, declaration merging, typed config/emitter, zero `any`; type tests (`test-d`)
- [x] IIFE build with command-queue stub replay, allowlisted + guarded dispatch, global `bt` declaration
- [x] Builds: ESM + per-adapter subpaths + IIFE, size-limit gate (3KB; core 2.80KB / bt.js 3.00KB brotli)
- [x] Publishing scaffolding: exports map, changesets, CI + release workflows (OIDC/provenance), LICENSE, README, prepublishOnly guard
- [x] Post-review hardening (prototype-key mapping, queue eviction policy, skip-replay on configure, consent poll, deferred init probe, IIFE hardening)

## Done (v1 M3)

- [x] `git init` + initial commit (local)
- [x] Playwright integration matrix (`e2e/`): real vendor snippets with network-stubbed SDK recorders; permutations: pixels before init, after init, after first track, GTM-late injection, command-queue stub replay, GTM-only GA4; relay beacon assertions
- [x] Weekly cron CI run of the Playwright suite (`.github/workflows/pixel-drift.yml`)
- [x] Live smoke page (`demo/smoke.html`) with all six real pixel snippets — needs test-account ids filled in
- [x] Docs: README covers relay/server, opt-in adapters, identify, debug build (README-only for now)
- [x] First changeset written (`.changeset/many-events-relay.md`)

## Done (v1.1)

- [x] `identify()` PII hashing (SHA-256 via SubtleCrypto) for TikTok; GA4 user_id already wired. (Reddit advanced matching is init-time-only client-side — handled by the server relay instead.)
- [x] Opt-in adapters: Pinterest (`pintrk`), Snap (`snaptr`), Microsoft/Bing (`uetq`) via `use()` + subpath exports (mapping lives in-adapter so core stays small)
- [x] Debug build (`bt.debug.js`): dispatch tables, detection/relay logs, X/LinkedIn "detected but unconfigured" hints

## Done (v2)

- [x] Client: `event_id` on every event, wired into pixel dedup fields (Meta `eventID`, TikTok `event_id`, Reddit `conversionId`, Snap `client_dedup_id`)
- [x] Client: match-signal collector (vendor cookies re-read per event; click ids captured at init) + relay beacon transport via `relayTo()` (`sendBeacon` → `fetch keepalive`), `relay`/`relay-error` emitter events, consent-gated, `sent` list for server dedup policy; relay + collector live outside core and tree-shake out of ESM builds that never import `relayTo` (size-limit proves it: 2.26KB pixels-only vs 2.78KB full)
- [x] Server: `better-tracking/server` — `createRelay`, `handle(Request)`, typed `send()`; payload validation + size cap, PII normalization + hash-at-ingest, senders for Meta/GA4/TikTok/LinkedIn/Reddit/X, bounded retry (3 attempts, 429/5xx only), allSettled-style fan-out with `onError`, test-event codes (Meta/TikTok/Reddit test_mode)
- [x] Dependency-free OAuth 1.0a HMAC-SHA1 signer for X (WebCrypto)
- [x] Dedup policy: same `event_id` both paths; GA4 fallback-only default (`mode: 'always'` opt-out)
- [x] Framework integrations: `better-tracking/next` (`createNextRoute` + `createPagesApiHandler`), `better-tracking/tanstack-start` (`createStartRoute`), `better-tracking/node` (`toNodeHandler`)
- [x] CI: Node 18/20/22 test matrix + Playwright e2e job

## Remaining (needs Ryan / external accounts)

- [ ] Create GitHub repo + push; add repo to npm trusted publishers (npmjs.com → package → Trusted Publisher); then merge the changeset PR to publish `0.1.0`
- [ ] Fill real test-account pixel ids into `demo/smoke.html` and verify with vendor pixel-helper extensions
- [ ] Nightly sandbox CI against vendor validation endpoints (needs real sandbox credentials in repo secrets)
- [ ] workerd CI leg for the server package (add `@cloudflare/vitest-pool-workers` once repo is on GitHub)
- [ ] Tier-1 framework fixture smoke tests in CI (create-next-app / create-start scaffolds under `fixtures/`)
- [ ] Docs site beyond README

## Later

- [ ] v2.1: client-side batching (measured need), LinkedIn token-refresh docs, monorepo split if server surface grows past ~10KB
- [ ] v3 (exploratory): optional pixel SDK loading, auto-capture plugin

## Done (post-review restructuring)

- [x] Relay extracted from core behind `relayTo()` (tree-shakeable); opt-in `waitUntil` on the server relay
- [x] All adapters removed from the core entry: `better-tracking` = engine only (1.86KB), `better-tracking/auto` = zero-config with six built-ins (2.84KB), bt.js unchanged behavior (2.96KB)
- [x] Shared `src/detectors.ts` + dev-only missing-adapter warnings via the `development` export condition (`__DEV__` define; index.dev.js/auto.dev.js builds; bt.debug.js includes them)

## Open questions (need Ryan's call)

- [ ] PRD §11: GTM-only GA4 approach (current impl pushes to dataLayer — confirm), bundle growth policy, canonical vocabulary naming, 3KB vs 2KB budget (bt.js at 2.89KB brotli after the relay extraction; pixels-only ESM at 2.26KB)
- [ ] PRD §12.10: relay batching scope, LinkedIn token refresh ownership, monorepo split threshold
