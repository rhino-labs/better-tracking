# better-tracking

Tiny (<3KB gzip), zero-config event tracking. One `track()` call fans out to every ad pixel already installed on the page — Meta (Facebook), GA4, TikTok, LinkedIn, Reddit, and X/Twitter — translated into each vendor's native event taxonomy.

- **Auto-detects** which pixels are on the page (including ones injected late by GTM or consent managers) — no destination config, no account IDs.
- **Queues** events fired before pixels load and replays them per-vendor.
- **Loads nothing, stores nothing**: no network requests of its own, no cookies, no localStorage. Data flows only through your existing pixels.
- **Strictly typed**: known events get autocompleted, compile-checked params; register your own events via declaration merging.
- ESM-only, tree-shakeable adapters, plus an IIFE build for script tags.

## Two modes

### 1. Client-side (default) — pixels only

Paste one snippet or import one function; every `track()` call fans out to the pixels
already on the page. Nothing to host, no vendor tokens, no account IDs — the library
sends **no network requests of its own** and stores nothing. This is the full product:
detection, queueing, late-pixel replay, consent gating, SPA support.

```ts
import { track } from 'better-tracking/auto';
track('purchase', { value: 49.99, currency: 'USD' });
```

At 2.84KB brotli for everything — or from 1.86KB + ~0.15KB per hand-picked adapter
on the bare entry — this is the mode to start with. Its ceiling
is the same as every pixel setup: ad blockers, Safari/Firefox cookie limits, and
pre-load bounces eat an estimated 20–40% of conversions.

### 2. Hybrid — pixels + server relay (Conversions APIs)

Everything above, **plus** each event is beaconed to a first-party endpoint you host,
where [`better-tracking/server`](#server-side-events-conversions-apis) re-sends it
through the vendors' server APIs (Meta CAPI, GA4 Measurement Protocol, TikTok Events
API, LinkedIn/Reddit/X). Both paths carry the same `event_id`, so vendors deduplicate —
dual delivery recovers blocked conversions and improves match rates.

```ts
import { configure, relayTo } from 'better-tracking';
configure({ relay: relayTo('/api/events') });   // client: one line
// server: createRelay({ meta: {…}, ga4: {…} }) behind that route — see below
```

Adopt incrementally: launch client-side, add the relay when the blocked-conversion gap
starts to matter. The dedup ids flow from day one, so flipping hybrid on later needs no
client changes beyond the `relayTo()` line.

| | Client-side | Hybrid |
|---|---|---|
| Setup | one snippet / import | + one route in your app, vendor API tokens |
| Infra | none | your existing server or edge runtime |
| Ad-blocked / ITP-lost conversions | lost (like any pixel setup) | recovered via server APIs |
| Identity matching | GA4 `user_id`, TikTok hashed email/phone | + hashed identity to Meta/Reddit/LinkedIn/X |
| Bundle | from 1.86KB (engine + chosen adapters) | + ~0.5KB relay transport (script tag: 2.96KB either way) |
| Data path | pixels only, nothing stored | + your first-party endpoint (hash-at-ingest, never persisted) |

## Install

```sh
npm install better-tracking
```

Zero-config — the `auto` entry registers all six built-in adapters:

```ts
import { track } from 'better-tracking/auto';

track('purchase', { value: 49.99, currency: 'USD', items: [{ id: 'sku1', price: 49.99 }] });
```

À la carte — the bare entry is the engine only (1.86KB); every adapter is an
opt-in subpath import, so you ship exactly the vendors you use:

```ts
import { track, use } from 'better-tracking';
import { meta } from 'better-tracking/adapters/meta';
import { ga4 } from 'better-tracking/adapters/ga4';
use(meta, ga4);

track('purchase', { value: 49.99, currency: 'USD' });
```

Importing the bare entry has no side effects — the tracker (and its pixel
detection probes) initializes lazily on the first API call, so type-only or
unused imports tree-shake away completely.

In development builds (the standard `development` [export
condition](https://nodejs.org/api/packages.html#conditional-exports), which Vite,
webpack, and `node --conditions=development` resolve automatically), the engine
includes lightweight detectors for **all** known vendors and warns when a pixel is
live on the page that has no registered adapter — so a GTM-added TikTok tag can't
silently go untracked. The detector table compiles out of production builds.

Or with a script tag (via jsDelivr/unpkg — always zero-config, all adapters included):

```html
<script>window.bt=window.bt||function(){(bt.q=bt.q||[]).push(arguments)}</script>
<script src="https://cdn.jsdelivr.net/npm/better-tracking/dist/bt.js" defer></script>
<script>
  bt('track', 'purchase', { value: 49.99, currency: 'USD' });
</script>
```

## API

```ts
import { track, page, identify, configure, on, detected } from 'better-tracking';

track('sign_up');                          // canonical events, mapped per vendor
track('demo_booked', { plan: 'pro' });     // custom events pass through

page({ path: '/pricing' });                // SPA page views

configure({
  debug: true,                             // log every dispatch
  disable: ['tiktok'],                     // suppress detected vendors
  consent: () => window.__consent === true,// gate dispatch behind your CMP
  spa: true,                               // auto page_view on history changes
  map: {
    // X needs per-event ids; LinkedIn needs conversion_ids:
    purchase: { x: 'tw-xxxxx-yyyyy', linkedin: '12345' },
    // override any built-in mapping:
    demo_booked: { meta: 'Schedule', ga4: 'generate_lead' },
  },
});

on('dispatch', ({ vendor, event }) => console.log(vendor, event));
detected();                                // ['meta', 'ga4', ...]
```

### Typed custom events

```ts
declare module 'better-tracking' {
  interface EventMap {
    demo_booked: { plan: 'free' | 'pro' | 'enterprise' };
  }
}
```

## Event mapping

| Canonical | Meta | GA4 | TikTok | Reddit |
|---|---|---|---|---|
| `page_view` | `PageView` | `page_view` | (auto) | `PageVisit` |
| `view_item` | `ViewContent` | `view_item` | `ViewContent` | `ViewContent` |
| `search` | `Search` | `search` | `Search` | `Search` |
| `add_to_cart` | `AddToCart` | `add_to_cart` | `AddToCart` | `AddToCart` |
| `begin_checkout` | `InitiateCheckout` | `begin_checkout` | `InitiateCheckout` | custom |
| `purchase` | `Purchase` | `purchase` | `CompletePayment` | `Purchase` |
| `sign_up` | `CompleteRegistration` | `sign_up` | `CompleteRegistration` | `SignUp` |
| `generate_lead` | `Lead` | `generate_lead` | `SubmitForm` | `Lead` |

Unknown events use each vendor's custom-event mechanism (`fbq('trackCustom', …)`, Reddit `Custom`, GA4 as-is). X and LinkedIn conversions require ids supplied via `configure({ map })` and are skipped otherwise.

## Server-side events (Conversions APIs)

The server half of [hybrid mode](#2-hybrid--pixels--server-relay-conversions-apis):
the client beacons every event to a first-party endpoint you host, and
`better-tracking/server` fans it out to the vendors' server APIs (Meta CAPI, GA4
Measurement Protocol, TikTok Events API, LinkedIn/Reddit/X Conversions APIs) with the
same `event_id` the pixel received, so vendors deduplicate the two paths.

**Client** — import the transport (it tree-shakes out entirely if you never use it,
~0.5KB):

```ts
import { configure, relayTo } from 'better-tracking';

configure({ relay: relayTo() });          // POSTs to /api/events
// or: relayTo('/collect')  |  relayTo({ url, headers?, transform? })
```

Script tags keep the plain form — `bt('configure', { relay: true })` or a URL string —
since a snippet can't carry a function (bt.js always includes the relay code).

Each event gets an `event_id` (wired into `fbq` `eventID`, TikTok `event_id`, Reddit
`conversionId`, Snap `client_dedup_id`), and the beacon carries match signals (`_fbp`,
`_fbc`, `_ga`, `_ttp` cookies; `fbclid`/`ttclid`/`gclid`/… click ids from the landing
URL), page context, and which pixels already fired. Uses `sendBeacon` with a
`fetch keepalive` fallback; respects the same `consent` gate. Observe with
`on('relay', …)` / `on('relay-error', …)`.

**Server** — your infra, your tokens; Web-standard `Request → Response`, so it runs on
Node 18+, Cloudflare Workers, Vercel Edge, Deno, and Bun:

```ts
import { createRelay } from 'better-tracking/server';

const relay = createRelay({
  meta:   { pixelId: '123', accessToken: env.META_TOKEN },
  ga4:    { measurementId: 'G-XXX', apiSecret: env.GA4_SECRET },
  tiktok: { pixelCode: 'ABC', accessToken: env.TT_TOKEN },
  // linkedin: { accessToken, conversionMap: { purchase: 12345 } },
  // reddit:   { pixelId, accessToken },
  // x:        { pixelId, consumerKey, consumerSecret, accessToken, accessTokenSecret,
  //             eventMap: { purchase: 'tw-x-y' } },  // OAuth 1.0a signed, no deps
});

export const POST = (req: Request) => relay.handle(req);

// server-originated events (refunds, offline conversions):
await relay.send('purchase', { value: 49.99, currency: 'USD' }, {
  event_id: 'order-1234',
  user: { email: 'a@b.com' },   // normalized + SHA-256 hashed before any vendor call
});
```

PII is hashed at ingest and never persisted. Retries are bounded (3 attempts on
429/5xx), one vendor's failure never blocks the others, and GA4 defaults to
**fallback-only** (sent only when the gtag pixel didn't fire — GA4 has no dedup).

**Framework wrappers** (zero relay logic, just route idioms):

```ts
// Next.js App Router — app/api/events/route.ts
import { createNextRoute } from 'better-tracking/next';
export const { POST } = createNextRoute({ meta: { … } });
// Pages Router: createPagesApiHandler(…) (+ config = { api: { bodyParser: false } })

// TanStack Start — createStartRoute(…) from 'better-tracking/tanstack-start'
// Express/Fastify/Koa — toNodeHandler(relay) from 'better-tracking/node'
// SvelteKit/Remix/Astro/Hono/Workers: export const POST = ({ request }) => relay.handle(request)
```

## Adapters

Every adapter is a subpath import registered with `use()`. The six built-ins
(`meta`, `ga4`, `tiktok`, `linkedin`, `reddit`, `x`) come pre-registered on
`better-tracking/auto` and in bt.js; Pinterest, Snap, and Microsoft/Bing UET are
always explicit:

```ts
import { use } from 'better-tracking/auto';   // six built-ins already registered
import { pinterest } from 'better-tracking/adapters/pinterest';
import { snap } from 'better-tracking/adapters/snap';
import { bing } from 'better-tracking/adapters/bing';
use(pinterest, snap, bing);
```

The dev-build warning covers all nine vendors, so a pixel on the page without its
adapter registered is flagged in the console whichever entry you use.

## identify()

`identify({ email, phone, user_id })` forwards to vendors with identity APIs: GA4
(`user_id`), TikTok (email/phone normalized and SHA-256 hashed via SubtleCrypto before
the call). With `relay` configured, raw traits go to your first-party endpoint and are
hashed server-side for the Conversions APIs.

## Debug build

Swap `bt.js` for `bt.debug.js` in development for a dispatch table per event, detection
logs, relay logs, and hints when X/LinkedIn are detected but unconfigured. Dev-only —
no size budget.

## Development

```sh
npm install
npm run check   # typecheck + lint + tests + build + size budget
npm run e2e     # Playwright late-load matrix (real vendor snippets, stubbed SDKs)
```

`demo/smoke.html` is a live smoke page wired to all six pixels — fill in test-account
ids and verify with the vendors' pixel-helper extensions. A weekly CI cron re-runs the
Playwright matrix to catch vendor snippet drift.

MIT
