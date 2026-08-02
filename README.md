# better-tracking

Tiny (<3KB gzip), zero-config event tracking. One `track()` call fans out to every ad pixel already installed on the page — Meta (Facebook), GA4, TikTok, LinkedIn, Reddit, and X/Twitter — translated into each vendor's native event taxonomy.

- **Auto-detects** which pixels are on the page (including ones injected late by GTM or consent managers) — no destination config, no account IDs.
- **Queues** events fired before pixels load and replays them per-vendor.
- **Loads nothing, stores nothing**: no network requests of its own, no cookies, no localStorage. Data flows only through your existing pixels.
- **Strictly typed**: known events get autocompleted, compile-checked params; register your own events via declaration merging.
- ESM-only, tree-shakeable adapters, plus an IIFE build for script tags.

## Install

```sh
npm install better-tracking
```

```ts
import { track } from 'better-tracking';

track('purchase', { value: 49.99, currency: 'USD', items: [{ id: 'sku1', price: 49.99 }] });
```

Or with a script tag (via jsDelivr/unpkg):

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

Client pixels lose 20-40% of conversions to ad blockers and cookie limits. v2 adds an
additive server path: the client beacons every event to a first-party endpoint you host,
and `better-tracking/server` fans it out to the vendors' server APIs (Meta CAPI, GA4
Measurement Protocol, TikTok Events API, LinkedIn/Reddit/X Conversions APIs) with the
same `event_id` the pixel received, so vendors deduplicate the two paths.

**Client** — one config key:

```ts
configure({ relay: true });               // POSTs to /api/events
// or: relay: '/collect'  |  relay: { url, headers?, transform? }
```

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

## Opt-in adapters

Pinterest, Snap, and Microsoft/Bing UET ship as subpath adapters that stay out of the
core bundle:

```ts
import { use } from 'better-tracking';
import { pinterest } from 'better-tracking/adapters/pinterest';
import { snap } from 'better-tracking/adapters/snap';
import { bing } from 'better-tracking/adapters/bing';
use(pinterest); use(snap); use(bing);
```

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
