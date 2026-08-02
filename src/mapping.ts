import type { KnownEvent, VendorId } from './types';

/**
 * Canonical event → vendor-native event name. Absent entry means the vendor
 * has no native equivalent: adapters then fall back to their custom-event
 * mechanism, or skip (x/linkedin, which need per-account ids via config.map).
 * ga4 has no table because the canonical names ARE the GA4 names — its
 * adapter falls back to the raw event name, so an identity table here would
 * only cost bytes.
 */
export const MAPPING = {
  meta: {
    page_view: 'PageView',
    view_item: 'ViewContent',
    search: 'Search',
    add_to_cart: 'AddToCart',
    begin_checkout: 'InitiateCheckout',
    purchase: 'Purchase',
    sign_up: 'CompleteRegistration',
    generate_lead: 'Lead',
  },
  tiktok: {
    view_item: 'ViewContent',
    search: 'Search',
    add_to_cart: 'AddToCart',
    begin_checkout: 'InitiateCheckout',
    purchase: 'CompletePayment',
    sign_up: 'CompleteRegistration',
    generate_lead: 'SubmitForm',
  },
  reddit: {
    page_view: 'PageVisit',
    view_item: 'ViewContent',
    search: 'Search',
    add_to_cart: 'AddToCart',
    purchase: 'Purchase',
    sign_up: 'SignUp',
    generate_lead: 'Lead',
  },
  // opt-in vendors (pinterest/snap/bing) map inside their adapter modules so
  // their tables tree-shake out of the core bundle
} as const satisfies Partial<Record<VendorId, Partial<Record<KnownEvent, string>>>>;

// own-property guard (ES2020-compatible Object.hasOwn): a custom event named
// e.g. 'constructor' must not resolve to Object.prototype members
export const hasOwn = (obj: object, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(obj, key);

export const mappedName = (vendor: VendorId, event: string): string | undefined => {
  const table = hasOwn(MAPPING, vendor)
    ? (MAPPING as Partial<Record<VendorId, Partial<Record<string, string>>>>)[vendor]
    : undefined;
  return table && hasOwn(table, event) ? table[event] : undefined;
};
