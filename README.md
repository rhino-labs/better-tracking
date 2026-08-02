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

## Development

```sh
npm install
npm run check   # typecheck + lint + tests + build + size budget
```

MIT
