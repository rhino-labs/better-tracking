import type { KnownEvent, VendorId } from './types';

/**
 * Canonical event → vendor-native event name. Absent entry means the vendor
 * has no native equivalent: adapters then fall back to their custom-event
 * mechanism, or skip (x/linkedin, which need per-account ids via config.map).
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
  ga4: {
    page_view: 'page_view',
    view_item: 'view_item',
    search: 'search',
    add_to_cart: 'add_to_cart',
    begin_checkout: 'begin_checkout',
    purchase: 'purchase',
    sign_up: 'sign_up',
    generate_lead: 'generate_lead',
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
  x: {},
  linkedin: {},
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
