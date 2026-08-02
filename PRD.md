# PRD: better-tracking

**A zero-config, auto-detecting event tracking library for the web**

| | |
|---|---|
| Status | Draft for review |
| Author | Ryan (with Claude) |
| Date | 2026-08-02 |
| Version | 0.1 |

---

## 1. Problem Statement

Marketing and product teams routinely run 3–7 tracking pixels on a single site (Meta/Facebook, GA4, TikTok, LinkedIn, Reddit, X/Twitter, etc.). Firing a single conversion event today means writing per-vendor glue code:

```js
// The status quo — repeated for every event, on every site
fbq('track', 'Purchase', { value: 49.99, currency: 'USD' });
gtag('event', 'purchase', { value: 49.99, currency: 'USD' });
ttq.track('CompletePayment', { value: 49.99, currency: 'USD' });
lintrk('track', { conversion_id: 12345 });
rdt('track', 'Purchase', { value: 49.99, currency: 'USD' });
twq('event', 'tw-xxxxx-yyyyy', { value: 49.99, currency: 'USD' });
```

Problems with the status quo:

1. **Duplication & drift** — the same event is hand-mapped N times; vendors get missed when new pixels are added via a tag manager.
2. **Vendor API inconsistency** — each network has its own event names (`Purchase` vs `purchase` vs `CompletePayment`), parameter names (`value` vs `conversion_value`), and call signatures.
3. **Timing bugs** — pixels load async; events fired before a pixel initializes are silently dropped.
4. **Bloat** — existing abstraction layers (Segment analytics.js ~30KB+, GTM as a meta-container) are heavy and require configuration of every destination.

## 2. Product Vision

One tiny script, one API call, every pixel on the page:

```js
track('purchase', { value: 49.99, currency: 'USD' });
```

The library **discovers which tracking pixels are already installed on the page** and fans the event out to each of them, translated into each vendor's native event taxonomy. No destination configuration, no account IDs to supply (the pixels already know their own IDs), no build step required.

### Guiding principles

1. **Tiny footprint** — core budget: **< 3KB gzipped**. Every feature must justify its bytes.
2. **Zero config by default** — detection over configuration. Works by pasting one snippet.
3. **Never break the page** — every vendor call wrapped in try/catch; failures are silent (loggable in debug mode).
4. **Don't load anything** — the library *detects and uses* pixels installed by the site; it never injects vendor SDKs itself (v1). This keeps it small and keeps consent responsibility with the site's existing setup.
5. **Strictly typed** — written in TypeScript under maximum strictness; the public API is fully typed end-to-end (event names, per-event params, config, adapter contract), with zero `any` in the shipped types. Types are erased at build time, so this costs no bytes.

## 3. Target Users

- **Developers at agencies / e-com shops** maintaining sites where marketing adds pixels via GTM without telling engineering.
- **Indie hackers / small SaaS** who want conversion tracking on all their ad platforms without integrating 6 SDKs.
- **Marketing engineers** who want a stable internal event API decoupled from the vendor mix.

## 4. Goals & Non-Goals

### Goals (v1)

- Auto-detect and dispatch to: **Meta Pixel, GA4 (gtag.js), TikTok, LinkedIn, Reddit, X/Twitter Pixel**.
- Semantic event mapping (a canonical event vocabulary translated per-vendor).
- Queue events fired before pixels finish loading; flush on detection.
- Late-pixel detection (pixels injected after our script runs, e.g. by GTM or consent managers).
- Debug mode showing exactly what was sent where.
- ESM + IIFE (script tag) builds, tree-shakeable adapters.
- **Strict typing**: known events get typed, autocompleted params; custom events are registrable via declaration merging; `strict` + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` enforced; no `any` anywhere in source or published `.d.ts`.

### Non-Goals (v1)

- ❌ Loading/injecting vendor pixel SDKs (v2 candidate).
- ❌ Server-side tracking / Conversions APIs in v1 — designed for v2, see §12.
- ❌ Consent management (we respect the page's setup; optional consent *gate* hook only).
- ❌ Being a full CDP/analytics platform (no persistence, no user profiles, no destinations beyond on-page pixels).
- ❌ Automatic click/scroll/form auto-capture (v2 candidate as an opt-in plugin).

## 5. Supported Vendors (v1)

| Vendor | Global detection signal | Native call |
|---|---|---|
| Meta (Facebook) Pixel | `window.fbq` (function with `.callMethod`/`.queue`) | `fbq('track', name, params)` |
| Google Analytics 4 | `window.gtag` fn, or `window.dataLayer` array (gtag/GTM) | `gtag('event', name, params)` / `dataLayer.push` |
| TikTok Pixel | `window.ttq` (object with `.track`) | `ttq.track(name, params)` |
| LinkedIn Insight | `window.lintrk` fn (+ `_linkedin_partner_id`) | `lintrk('track', { conversion_id })` |
| Reddit Pixel | `window.rdt` fn | `rdt('track', name, params)` |
| X / Twitter Pixel | `window.twq` fn | `twq('event', eventId, params)` |

**Extensible registry**: additional vendors (Pinterest `pintrk`, Snap `snaptr`, Microsoft/Bing `uetq`, Quora `qp`, Amplitude, Mixpanel, Plausible, Umami…) ship as opt-in adapters that tree-shake out when unused, or land in later releases of the auto bundle if budget allows.

## 6. Public API

```ts
import { track, page, identify, configure, on } from 'better-tracking';

// Core: fire a semantic event to all detected pixels.
// Known events are fully typed: 'purchase' requires { value, currency },
// misspelled params or wrong types are compile errors.
track('purchase', { value: 49.99, currency: 'USD', items: [...] });

// Custom events pass through with best-effort mapping.
// Typed via declaration merging (see §7.6); untyped string names
// are still allowed but params fall back to a generic record.
track('demo_booked', { plan: 'pro' });

// Page views (SPAs)
page({ path: '/pricing' });

// Identity (only forwarded to vendors that support it, e.g. GA4 user_id,
// TikTok identify; hashed where vendors require it — v1.1)
identify({ email: 'a@b.com' });

// Optional configuration — everything has defaults
configure({
  debug: true,                     // console table of dispatches
  disable: ['tiktok'],             // suppress specific detected vendors
  consent: () => window.__consentGranted === true,  // gate before any dispatch
  map: {                           // override/extend event mapping
    demo_booked: { meta: 'Schedule', ga4: 'generate_lead' },
  },
});

// Observability
on('dispatch', ({ vendor, event, params }) => { ... });
on('detect', ({ vendor }) => { ... });
```

Script-tag usage (no build step):

```html
<script src="https://cdn.example.com/bt.js" defer></script>
<script>
  // bt() queues safely even before bt.js loads (standard command-queue stub)
  bt('track', 'purchase', { value: 49.99, currency: 'USD' });
</script>
```

## 7. Technical Design

### 7.1 Architecture

```
┌─────────────────────────────────────────────────────┐
│  Public API  track() / page() / identify()          │
└──────────────────────┬──────────────────────────────┘
                       ▼
┌─────────────────────────────────────────────────────┐
│  Event Bus + Pre-Detection Queue                    │
│  (buffers events until ≥1 vendor detected;          │
│   per-vendor replay for late-loading pixels)        │
└──────────────────────┬──────────────────────────────┘
                       ▼
┌─────────────────────────────────────────────────────┐
│  Semantic Mapper                                    │
│  canonical event + params  →  vendor event + params │
└──────────────────────┬──────────────────────────────┘
                       ▼
┌────────┬────────┬────────┬─────────┬────────┬───────┐
│  Meta  │  GA4   │ TikTok │LinkedIn │ Reddit │  X    │   ← adapters
└────────┴────────┴────────┴─────────┴────────┴───────┘
          ▲
┌─────────┴───────────────────────────────────────────┐
│  Detector: probe-on-init + retry ticks + lazy       │
│  re-probe on dispatch (catches GTM-late pixels)     │
└─────────────────────────────────────────────────────┘
```

### 7.2 Detection strategy

Detecting a pixel is checking for its global with a validity test (not just `typeof !== 'undefined'`, since stub queues exist before the real SDK loads — which is fine: calling a stub queues natively on the vendor side).

```js
const detectors = {
  meta:     () => typeof fbq === 'function' && !!(fbq.callMethod || fbq.queue),
  ga4:      () => typeof gtag === 'function' || Array.isArray(window.dataLayer),
  tiktok:   () => !!(window.ttq && typeof window.ttq.track === 'function'),
  linkedin: () => typeof window.lintrk === 'function',
  reddit:   () => typeof window.rdt === 'function',
  x:        () => typeof window.twq === 'function',
};
```

**Timing** (pixels can appear at any moment — GTM, consent managers, `defer` scripts):

1. **Initial probe** on library init.
2. **Retry schedule**: probes at 0ms, 500ms, 1.5s, 3s, 6s, 12s after init (~6 checks, then stop). Cheap: each full probe is ~6 property lookups.
3. **Re-probe on every `track()` call** for not-yet-detected vendors — an event fired 2 minutes in still finds a pixel that loaded late.
4. On new detection: **flush the queued event backlog to that vendor only** (per-vendor delivery marks, so vendors detected early don't receive duplicates).

Queue is capped (default 50 events) and lives in memory only — no storage, no cross-page replay (avoids duplicate-conversion risk). On overflow, fully-delivered history is evicted before pending events, so the cap bounds the undelivered backlog. Vendors that skip an event for missing config (X/LinkedIn ids) leave it undelivered, so a later `configure({ map })` replays it. When a `consent` gate is configured and returns false, pending events trigger a 500ms poll so consent granted via a CMP banner flushes without requiring another `track()` call.

An important subtlety: most vendor snippets install a **stub with a command queue** before their SDK loads (that's what the standard paste-in snippet does). We treat a valid stub as "detected" and call it immediately — the vendor's own queue handles the rest. Our queue only covers the window before *any* stub/SDK exists.

### 7.3 Semantic event mapping

A canonical vocabulary modeled loosely on GA4's recommended events, mapped per vendor. Stored as a compact lookup table (biggest byte-cost item — kept minimal and mangle-friendly):

| Canonical | Meta | GA4 | TikTok | Reddit | X | LinkedIn |
|---|---|---|---|---|---|---|
| `page_view` | `PageView` | `page_view` | `Pageview` (auto) | `PageVisit` | (pixel auto) | (auto) |
| `view_item` | `ViewContent` | `view_item` | `ViewContent` | `ViewContent` | custom | — |
| `search` | `Search` | `search` | `Search` | `Search` | custom | — |
| `add_to_cart` | `AddToCart` | `add_to_cart` | `AddToCart` | `AddToCart` | custom | — |
| `begin_checkout` | `InitiateCheckout` | `begin_checkout` | `InitiateCheckout` | custom | custom | — |
| `purchase` | `Purchase` | `purchase` | `CompletePayment` | `Purchase` | conversion event | conversion |
| `sign_up` | `CompleteRegistration` | `sign_up` | `CompleteRegistration` | `SignUp` | custom | conversion |
| `generate_lead` | `Lead` | `generate_lead` | `SubmitForm` | `Lead` | custom | conversion |
| *(unknown)* | `trackCustom` | as-is | as-is | `Custom` | custom | skipped |

**Parameter translation** handled per adapter: canonical `{ value, currency, items, query, ... }` maps to each vendor's expected keys (e.g. `items` → Meta `contents` + `content_ids`; GA4 passes `items` through; TikTok `contents`).

All mapping lookups (built-in table and `config.map`) go through an own-property guard so event names colliding with `Object.prototype` members (`constructor`, `toString`, …) fall through to the custom-event path. The script-tag dispatcher allowlists command names and guards each replayed stub command, so one malformed pre-load call can neither reach prototype members nor drop the rest of the queue.

**Vendor quirks that need config** (the two exceptions to zero-config):
- **X Pixel** requires per-event IDs (`twq('event', 'tw-ovqxq-xxxxx')`). Auto-detection can fire the base pixel, but conversion events need `configure({ map: { purchase: { x: 'tw-...' } } })`.
- **LinkedIn** conversions need `conversion_id`s. Without config we fire nothing beyond LinkedIn's automatic page tracking, and surface a debug-mode hint.

### 7.4 Adapter interface

Each adapter is ~15–30 lines:

```ts
interface Adapter {
  readonly id: VendorId;          // 'meta' | 'ga4' | 'tiktok' | ...
  detect(): boolean;
  track(event: string, params: Readonly<EventParams>): void;  // already-mapped values
  page?(props: Readonly<PageProps>): void;
  identify?(traits: Readonly<Traits>): void;
}
```

Vendor globals (`fbq`, `ttq`, `gtag`, …) are typed with narrow hand-written declarations in a non-global `vendor-globals.d.ts` — accessed via typed helpers, never `(window as any)`.

All dispatch goes through a guard:

```js
function dispatch(adapter, event, params) {
  try { adapter.track(event, params); emit('dispatch', {...}); }
  catch (e) { if (debug) console.warn('[bt]', adapter.id, e); }
}
```

### 7.5 Bundle & size budget

- **Language/tooling**: TypeScript → esbuild/tsup. No runtime dependencies. ES2020 output (drops legacy-browser bloat; IE is out of scope).
- **Builds**: `bt.js` (IIFE, all built-in adapters, auto-init) and ESM with per-adapter subpath exports for tree-shaking (`better-tracking/adapters/meta`).
- **Budget enforcement**: CI check via `size-limit` — build fails if core+6 adapters exceeds **3KB gzip**. Estimated breakdown: core (queue/bus/detector) ~1.2KB, mapping table ~0.6KB, 6 adapters ~1.0KB.
- Debug tooling beyond basic warn logs lives in a separate `bt.debug.js` build with rich output (dispatch tables, "pixel found but unconfigured" hints) — dev-only, no size constraint.

### 7.6 Type system

Strict typing is a product feature: autocomplete of the event vocabulary and compile-time validation of params replace a chunk of documentation. Design:

**Compiler settings** (enforced in CI): `strict: true`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, `noFallthroughCasesInSwitch`, `isolatedModules`. ESLint bans `any`, non-null assertions, and unchecked type assertions (`@typescript-eslint/no-explicit-any`, `no-non-null-assertion`, `consistent-type-assertions` — allowed only in the vendor-global boundary layer with a lint-suppression comment explaining why).

**Typed event vocabulary** — an interface maps each canonical event to its params; `track` is generic over it:

```ts
interface EventMap {
  page_view:      { path?: string; title?: string };
  view_item:      ItemParams;
  search:         { query: string };
  add_to_cart:    ItemParams & ValueParams;
  begin_checkout: ValueParams & { items?: Item[] };
  purchase:       ValueParams & { items?: Item[]; transaction_id?: string };
  sign_up:        { method?: string };
  generate_lead:  Partial<ValueParams>;
}

// Known events: exact param types. Unknown events: best-effort record.
function track<K extends keyof EventMap>(event: K, params: EventMap[K]): void;
function track(event: string & {}, params?: Record<string, Primitive>): void;
```

`ValueParams` couples `value` with a required `currency` (an ISO-4217 string union is overkill; `string` with a branded doc comment suffices) so you can't ship a currency-less purchase by accident.

**Custom events via declaration merging** — users extend the vocabulary in their own code and get full checking for site-specific events:

```ts
declare module 'better-tracking' {
  interface EventMap {
    demo_booked: { plan: 'free' | 'pro' | 'enterprise' };
  }
}
```

**Typed config** — `configure`'s `map` override is keyed by `keyof EventMap | (string & {})` and `VendorId`, so a typo'd vendor name or event name is a compile error. `on()` is generic over a typed `EventName → payload` map so listener payloads are inferred.

**Internal rigor** — the mapping table is declared `as const satisfies Record<VendorId, Partial<Record<keyof EventMap, string>>>`, so an adapter referencing a nonexistent event, or a mapping for an unknown vendor, fails to compile. `VendorId` is derived from the adapter registry (`typeof adapters[number]['id']`), keeping the union in one place.

**Published types** — `.d.ts` shipped for ESM entry and each adapter subpath; validated with `@arethetypeswrong/cli` and `tsc --strict` consumer-fixture tests (see §7.10). The IIFE build ships a global `bt` declaration file for script-tag users on TS-checked pages.

### 7.7 SPA support

- `page()` for manual route-change tracking.
- Optional auto mode (`configure({ spa: true })`): patch `history.pushState`/`replaceState` + `popstate` listener → fire `page_view`. ~200 bytes, off by default because GA4/TikTok often already have enhanced page tracking — double-firing is worse than opt-in.

### 7.8 Privacy & consent posture

- The library sends **no network requests of its own** and stores **nothing** (no cookies, no localStorage). All data flows through the site's already-installed pixels.
- Optional `consent` predicate gates all dispatching (events queue until it returns true) — integrates with any CMP in one line.
- `identify()` with PII (v1.1) will hash (SHA-256 via SubtleCrypto) before passing to vendors that expect hashed identifiers (TikTok, Reddit advanced matching), and only forward to vendors with a documented identity API.

### 7.9 Packaging & npm publishing

The package must be publishable to npm from day one, with a boring, automated release path.

**Package layout** (`package.json`):

```jsonc
{
  "name": "better-tracking",           // verified unclaimed on npm as of 2026-08-02
  "version": "0.x via changesets",
  "type": "module",
  "sideEffects": false,                // adapters tree-shake cleanly
  "exports": {
    ".":               { "types": "./dist/index.d.ts",  "import": "./dist/index.js" },
    "./adapters/*":    { "types": "./dist/adapters/*.d.ts", "import": "./dist/adapters/*.js" },
    "./bt.js":         "./dist/bt.js",          // IIFE for script tags / CDNs
    "./package.json":  "./package.json"
  },
  "files": ["dist"],                   // nothing else ships
  "engines": { "node": ">=18" },       // for bundler consumers; runtime is browser-only
  "license": "MIT",
  "publishConfig": { "access": "public", "provenance": true }
}
```

- **ESM-only** (no CJS build): this is a browser library consumed via bundlers or script tag; dual-format doubles the maintenance surface for near-zero benefit in 2026. Documented in the README as a deliberate choice.
- `exports` map validated by `@arethetypeswrong/cli` and `publint` in CI, so resolution works under every `moduleResolution` mode consumers use.
- The IIFE build is inside the package so **jsDelivr/unpkg serve it automatically** (`https://cdn.jsdelivr.net/npm/better-tracking/dist/bt.js`) — no separate CDN infrastructure needed for v1.

**Release automation**:

- **Changesets** for versioning: every PR carries a changeset; merging to `main` opens/updates an automated "Version Packages" PR; merging that publishes.
- Publish runs in GitHub Actions via **npm Trusted Publishing (OIDC)** — no long-lived npm token in repo secrets — with `--provenance` for supply-chain attestation. A tracking library is exactly the kind of package that gets supply-chain scrutiny; provenance + no-token publishing is table stakes.
- Publish gate = full CI: typecheck, unit + type tests, Playwright matrix, `size-limit`, `publint`, `attw`, and a **pack smoke test** (`npm pack` → install the tarball into ESM-consumer and TS-consumer fixture projects → import, call `track`, typecheck).
- **Semver policy**: pre-1.0 minor bumps may break; post-1.0, changes to the event mapping tables (what a vendor receives for a canonical event) are **breaking changes**, since they alter ad-platform data. New adapters and new canonical events are minors.

**Repo hygiene for publishing**: MIT `LICENSE`, `README` with snippet + bundler quickstarts, `CHANGELOG.md` (generated by changesets), keywords for discoverability, `repository`/`bugs`/`homepage` fields, and an npm `prepublishOnly` guard that refuses to publish outside CI.

### 7.10 Testing strategy

- **Unit**: detectors and mappers against faked vendor globals (vitest + jsdom).
- **Type tests**: `vitest --typecheck` / `expect-type` fixtures asserting the public surface — valid calls compile, invalid params/event/vendor names produce errors, declaration merging works from a consumer package. Published types checked with `@arethetypeswrong/cli` in CI.
- **Integration**: Playwright pages loading real vendor snippets (with network-stubbed SDK responses) asserting correct native calls and network beacons — including the late-load matrix: pixel before us, after us, after first `track()`, injected by simulated GTM.
- **Size regression**: `size-limit` in CI.
- **Live smoke page**: a demo site with all six real pixels (test accounts) + vendor pixel-helper extensions for manual verification per release.

## 8. Success Metrics

- Core bundle ≤ 3KB gzip at v1 (hard gate).
- Event delivery parity: ≥ 99% of events reach every detected vendor in the Playwright late-load matrix.
- Time-to-integrate: a new user goes from snippet to verified events in vendor debuggers in < 10 minutes.
- Adoption proxies: npm downloads, GitHub stars, sites detected via `bt.js` in HTTP Archive (long-term).

## 9. Risks & Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Vendor API/global changes break adapters silently | Events lost | Guarded dispatch + Playwright suite against real snippets run on a weekly cron; adapters are tiny and fast to patch |
| Duplicate events (site already calls `fbq` directly + uses us) | Corrupted ad optimization | Docs push "route everything through `track()`"; debug mode flags same-named native calls (debug build only) |
| X/LinkedIn config requirement dilutes "zero config" story | Perceived complexity | Clear debug-mode hints; those vendors degrade gracefully to their automatic tracking |
| Ad blockers remove pixels | Nothing to dispatch to | Out of scope by design — no pixels means no tracking, same as status quo; Conversions-API support (v2) is the real answer |
| Mapping disagreements (what should `purchase` be for vendor Y?) | Wrong optimization signals | Mapping table published in docs; fully overridable via `configure.map` |

## 10. Milestones

| Phase | Scope | Target |
|---|---|---|
| M1 | Core: bus, queue, detector, Meta + GA4 adapters, IIFE + ESM builds, size CI; package scaffolding (exports map, changesets, publint/attw in CI) | Week 2 |
| M2 | TikTok, Reddit, X, LinkedIn adapters; mapping table; debug build; trusted-publishing pipeline live (0.x releases to npm) | Week 4 |
| M3 | Playwright late-load matrix, live smoke page, docs site, v1.0 on npm with provenance | Week 6 |
| v1.1 | `identify()` + hashing, SPA auto mode, Pinterest/Snap/Bing adapters | Week 10 |
| v2.0-client | Event ids on every event, click-id/cookie capture, `relay` beacon transport (§12.3) | Week 12 |
| v2.0-server | `better-tracking/server`: Meta + GA4 + TikTok senders, hashing, dedup (§12.4); Next.js + TanStack Start integrations (§12.5) | Week 16 |
| v2.1 | LinkedIn, Reddit, X senders; retry queue hooks; Tier-2 framework recipes + `toNodeHandler` | Week 20 |
| v3 (exploratory) | Optional pixel SDK loading, auto-capture plugin | — |

## 11. Open Questions

1. **GTM-only GA4** (dataLayer exists but no `gtag`): push GA4-shaped events into `dataLayer` directly, or require the site to expose `gtag`? (Proposed: push `{ event: name, ...params }` and document the needed GTM trigger.)
2. Should the auto bundle include more than 6 vendors if budget allows, or hold the line and grow the opt-in adapter list instead?
3. Naming: canonical vocabulary follows GA4 conventions (`purchase`, `sign_up`) — confirm, or define our own neutral vocabulary?
4. Is 3KB the right budget, or should we target 2KB and drop the built-in mapping overrides to a plugin?

## 12. v2 Design: Server-Side Events (Conversions APIs)

### 12.1 Why

Client pixels lose 20–40% of conversions to ad blockers, ITP/ETP cookie limits, and pre-load bounces. Every supported vendor now offers a server events API and rewards dual (pixel + server) delivery with better match rates. v2 adds this while keeping the v1 story intact: pixels keep firing exactly as today; server delivery is additive.

### 12.2 Architecture

```
Browser                          Your server                    Vendors
┌──────────────────┐   beacon    ┌──────────────────────┐  HTTPS  ┌──────────┐
│ track('purchase')│────────────▶│ better-tracking/server│───────▶│ Meta CAPI │
│  ├─▶ pixels (v1) │  canonical  │  ├─ receive/validate  │        │ GA4 MP    │
│  ├─ event_id     │  event +    │  ├─ hash PII (SHA-256)│        │ TikTok    │
│  └─ match signals│  event_id + │  ├─ map per vendor    │        │ LinkedIn  │
│    (cookies,     │  match      │  └─ send w/ tokens    │        │ Reddit    │
│     click ids)   │  signals    └──────────────────────┘        │ X CAPI    │
└──────────────────┘                                              └──────────┘
        └────────────── same event_id on both paths → vendor dedupes ─────────┘
```

Two hard constraints shape everything:

1. **Tokens live server-side only.** Every vendor API authenticates with a secret. Auto-detection cannot apply; server vendors are explicitly configured. The browser library never sees a token.
2. **Match quality comes from the browser.** Server events match users via hashed PII, vendor cookies, and click ids — all of which only exist client-side. So the client must harvest and forward them.

### 12.3 Client-side additions (`better-tracking`, ~+0.5KB)

**Event ids** — every `track()` gets an `event_id` (`crypto.randomUUID()`, `Math.random` fallback), passed to pixels where the vendor supports dedup ids (Meta `eventID` 4th arg, TikTok `event_id`, Reddit `conversion_id`… wired into the existing adapters) and included in the relay payload. This is the dedup linchpin.

**Match-signal capture** — a small collector reads, when present:

| Signal | Source | Feeds |
|---|---|---|
| `_fbp`, `_fbc` cookies | Meta pixel | Meta CAPI |
| `fbclid`, `ttclid`, `li_fat_id`, `rdt_cid`, `twclid`, `gclid` | landing URL params (captured at init, held in memory) | respective CAPIs |
| `_ga` cookie → `client_id` | GA4 | GA4 Measurement Protocol (required) |
| `_ttp` cookie | TikTok pixel | TikTok Events API |
| page URL, referrer | `location`/`document` | all |

No PII is collected automatically; `identify()` traits are forwarded raw to *your* endpoint over first-party HTTPS and hashed server-side (hashing client-side buys nothing when the relay is first-party, and keeps the client small).

**Relay transport**:

```ts
configure({
  relay: '/api/events',          // or { url, headers?, transform? }
});
```

- `navigator.sendBeacon` (survives unload/bounce), falling back to `fetch(..., { keepalive: true })`.
- Sends the canonical event — name, params, `event_id`, timestamp, match signals, page context — as JSON. One event per beacon in v2.0 (batching is a measured follow-up, not assumed).
- Respects the same `consent` gate and `disable` list as pixel dispatch.
- Relay delivery failures emit an `on('relay-error')` event; no client-side retry beyond `keepalive` semantics (the server owns reliability).
- New emitter event `relay` mirrors `dispatch` for observability.

Size budget: client stays under the 3KB gate; the collector + beacon is an estimated +0.4–0.5KB and ships in the core bundle only when `relay` is tree-shakeable-referenced (script-tag build includes it).

### 12.4 Server package (`better-tracking/server` subpath export)

**We do not host anything.** The relay runs inside the user's own app — their infrastructure, their vendor tokens, their data path. What we ship is the library plus first-class framework integrations that make self-hosting a one-file affair (§12.5).

Same npm package, new entry point — keeps the one-package story, and the browser bundle is unaffected (separate entry, `sideEffects: false`). Runtime target: **Node 18+ and edge runtimes** (Cloudflare Workers, Vercel Edge, Deno) by using only Web-standard APIs — `fetch` for delivery, WebCrypto `crypto.subtle.digest` for hashing. Zero runtime dependencies, same as the client.

```ts
import { createRelay } from 'better-tracking/server';

const relay = createRelay({
  meta:     { pixelId: '123', accessToken: env.META_TOKEN, testEventCode: env.META_TEST },
  ga4:      { measurementId: 'G-XXX', apiSecret: env.GA4_SECRET },
  tiktok:   { pixelCode: 'ABC', accessToken: env.TT_TOKEN },
  linkedin: { accessToken: env.LI_TOKEN, conversionMap: { purchase: 12345 } },
  reddit:   { pixelId: 't2_x', accessToken: env.RDT_TOKEN },
  x:        { pixelId: 'oxxxx', accessToken: env.X_TOKEN, eventMap: { purchase: 'tw-x-y' } },
});

// framework-agnostic: Web Request → Web Response
export const POST = (req: Request) => relay.handle(req);

// or imperative, for server-originated events (refunds, offline conversions):
await relay.send('purchase', { value: 49.99, currency: 'USD' }, {
  event_id: 'order-1234',            // your own id for dedup/idempotency
  user: { email: 'a@b.com' },        // hashed automatically before sending
});
```

**Responsibilities** (each is required for correctness, not optional polish):

1. **Payload validation** — reject malformed/oversized relay bodies; this endpoint is public and will be probed.
2. **PII normalization + hashing** — per-vendor normalization rules *before* SHA-256 (lowercase/trim emails, E.164 phones), since vendors only match on canonically-normalized hashes.
3. **Per-vendor mapping** — reuse the client's canonical `EventMap` types and event-name tables; add the server-only fields (`event_time`, `action_source: 'website'`, IP + user-agent forwarded from the relay request, vendor-specific envelope shapes).
4. **Dedup wiring** — pass the client `event_id` through in each vendor's dedup field (see 12.7).
5. **Delivery + retry** — `fetch` with timeout, retry with exponential backoff on 429/5xx (bounded, e.g. 3 attempts), never retry 4xx. Failures surface via a `onError` hook and the `send()` promise; durable queues (SQS etc.) are the integrator's choice via that hook, not built in.
6. **Fan-out isolation** — one vendor's failure never blocks the others (`Promise.allSettled` semantics, per-vendor results returned).
7. **Test-mode support** — Meta `test_event_code`, TikTok `test_event_code`, GA4 `debug/mp/collect` validation endpoint, wired through config for pre-production verification.

### 12.5 Framework integrations

The integration contract is deliberately the smallest thing that exists: **`relay.handle(Request) => Promise<Response>`** — Web-standard Request in, Web-standard Response out. Every modern framework either speaks this natively or is one thin shim away, which is what makes "more frameworks in the future" cheap: a new integration is a naming/DX wrapper plus docs, never new relay logic.

**Tier 1 — shipped subpath exports** (each ≤ ~30 lines over the core handler):

`better-tracking/next` — Next.js App Router:

```ts
// app/api/events/route.ts — the whole integration
import { createNextRoute } from 'better-tracking/next';

export const { POST } = createNextRoute({
  meta: { pixelId: '123', accessToken: process.env.META_TOKEN! },
  ga4:  { measurementId: 'G-XXX', apiSecret: process.env.GA4_SECRET! },
});
```

Runs on Node or Edge runtime unchanged. A `createPagesApiHandler` variant covers the legacy Pages Router (`NextApiRequest`/`NextApiResponse` shim).

`better-tracking/tanstack-start` — TanStack Start server route:

```ts
// src/routes/api/events.ts
import { createStartRoute } from 'better-tracking/tanstack-start';

export const Route = createStartRoute('/api/events', { meta: { ... }, ga4: { ... } });
```

**Tier 2 — works today with zero integration code**, documented with copy-paste recipes rather than wrappers, because these frameworks already hand you a Web `Request`: SvelteKit (`+server.ts`), Remix/React Router (resource route), Astro (API route), SolidStart, Hono, Cloudflare Workers, Deno, Bun — all one line: `export const POST = ({ request }) => relay.handle(request)` (modulo each framework's signature).

**Tier 3 — Node-legacy shim**: `toNodeHandler(relay)` converting `(req: IncomingMessage, res: ServerResponse)` for Express/Fastify/Koa and the Next Pages Router internally. This is the only real adapter code, written once and reused by anything pre-Web-standard.

Rules that keep this maintainable:

- Framework wrappers contain **zero relay logic** — config parsing, validation, hashing, sending all live in `better-tracking/server`. A wrapper only adapts route-registration idioms and re-exports types.
- Framework packages are subpath exports with their framework as an optional peer concern: importing `better-tracking/next` outside Next.js is a type error, not a runtime crash, and no framework code is ever bundled into the core entries.
- Each Tier-1 integration gets a smoke test in CI against a minimal scaffolded app of that framework (create-next-app / create-start fixtures, kept in `fixtures/`), so framework upgrades that break the wrapper surface in CI rather than in user apps.
- The client default `relay: true` shorthand means `/api/events`, matching where every Tier-1/2 recipe mounts the route — convention over configuration end to end.
- Promotion path: a Tier-2 recipe graduates to a Tier-1 wrapper when there's demonstrated demand, not preemptively.

### 12.6 Vendor implementation matrix

| Vendor | API / endpoint | Auth | Dedup field | Key match signals | Quirks |
|---|---|---|---|---|---|
| Meta | Conversions API `graph.facebook.com/v>=18.0/{pixel}/events` | access token (query) | `event_id` (pairs with pixel `eventID`) | hashed em/ph, `fbp`, `fbc`, client IP+UA | richest API; `action_source` required; batch up to 1000 |
| GA4 | Measurement Protocol `/mp/collect` | `api_secret` (query) | none (avoid double-send instead) | `client_id` (from `_ga`) **required**, optional `user_id` | supplement-only: no dedup with gtag, so relay sends GA4 **only** events the pixel didn't deliver, or the site opts GA4 out of relay (default: opt-out of relay when gtag detected client-side) |
| TikTok | Events API v2 `business-api.tiktok.com/.../event/track` | `Access-Token` header | `event_id` | hashed em/ph, `ttclid`, `ttp`, IP+UA | batch up to 1000 |
| LinkedIn | Conversions API `api.linkedin.com/rest/conversionEvents` | OAuth token, `LinkedIn-Version` header | `eventId` | hashed email or `li_fat_id` | conversion rule ids required (mirrors client-side quirk); versioned REST headers |
| Reddit | Conversions API `ads-api.reddit.com/.../conversions/events/{pixel}` | bearer token | `conversion_id`/uuid | hashed em, `rdt_cid` ("click id"), IP+UA | click id strongly recommended for match |
| X | Conversion API `ads-api.x.com/.../measurement/conversions/{pixel}` | OAuth 1.0a | `conversion_id` | hashed em, `twclid` | OAuth 1.0a signing is the implementation tax; per-event ids like the client side |

(Endpoints/versions verified against vendor docs at implementation time — they churn; this table pins the shape, not the version strings.)

### 12.7 Deduplication strategy

- **Meta / TikTok / Reddit / X / LinkedIn**: send both pixel and server events with the same `event_id` → vendor keeps one, match quality improves. This is the recommended dual-send mode and the default when both paths are active.
- **GA4**: no dedup mechanism exists. Default policy: if the GA4 pixel was detected client-side, the relay payload flags it and the server skips GA4; the server sends GA4 only when the client couldn't (blocked/absent). Overridable per site.
- Client marks each relayed event with which pixels it successfully dispatched to, so the server can apply per-vendor fallback-only policies beyond GA4 if configured.

### 12.8 Typing & testing additions

- Shared canonical types: `EventMap`, `Item`, relay payload schema exported from a common module consumed by both entries; the relay payload gets a versioned envelope (`v: 1`) for forward compatibility.
- Server config is fully typed per vendor (missing token/id = compile error); `send()` is generic over `EventMap` exactly like client `track()`.
- Tests: unit tests against recorded vendor request fixtures (assert exact payload shape + hashing per vendor); integration tests against vendors' validation/test-event endpoints in CI (nightly, real sandbox credentials); hash-normalization test vectors (Meta publishes canonical examples).
- New CI leg runs server tests on Node 18/20/22 and workerd (Cloudflare's runtime) to hold the edge-compatibility claim.

### 12.9 Risks specific to server-side

| Risk | Mitigation |
|---|---|
| Public relay endpoint abused (spam conversions, junk data poisoning ad optimization) | validation, payload size caps, same-origin checks documented; optional HMAC between a site's own client/server; rate limiting is the integrator's edge concern (documented pattern) |
| Vendor API churn (versions, auth schemes) | version strings centralized in one module per vendor; nightly sandbox CI catches breakage |
| GA4 double-counting (no dedup) | fallback-only default per 12.6 |
| PII handling raises the compliance stakes (relay sees raw emails) | hash-at-ingest before any logging hook fires; docs make the data-processor role explicit; never persist |
| OAuth 1.0a signing for X without dependencies | small self-contained HMAC-SHA1 signer (WebCrypto), ~60 lines, test vectors from spec |

### 12.10 New open questions

1. Should `relay.handle()` also accept batched arrays from a future batching client, or stay strictly one-event-per-request until measured need?
2. Is LinkedIn's OAuth token refresh (60-day expiry) in scope, or documented as the integrator's job? (Proposed: integrator's job, surfaced via `onError`.)
3. Monorepo split (`@better-tracking/server` as separate package) if the server surface grows past ~10KB, or hold the subpath-export line?
