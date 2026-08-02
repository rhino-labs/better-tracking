import { hasOwn } from '../mapping';
import type { Adapter, CommonParams, EventParams } from '../types';

const g = globalThis as { snaptr?: (...args: unknown[]) => void };

// Snap Pixel event vocabulary; unmapped events fall through as CUSTOM_EVENT_1-style names.
const MAP: Record<string, string> = {
  page_view: 'PAGE_VIEW',
  view_item: 'VIEW_CONTENT',
  search: 'SEARCH',
  add_to_cart: 'ADD_CART',
  begin_checkout: 'START_CHECKOUT',
  purchase: 'PURCHASE',
  sign_up: 'SIGN_UP',
  generate_lead: 'SIGN_UP',
};

function toSnapParams(params: Readonly<EventParams>): Record<string, unknown> {
  const { value, currency, items, query, ...rest } = params as CommonParams & EventParams;
  const p: Record<string, unknown> = { ...rest };
  if (value !== undefined) p['price'] = value;
  if (currency !== undefined) p['currency'] = currency;
  if (query !== undefined) p['search_string'] = query;
  if (items) {
    p['item_ids'] = items.map((i) => i.id).filter((id) => id !== undefined);
    p['number_items'] = items.reduce((n, i) => n + (i.quantity ?? 1), 0);
  }
  return p;
}

/** Opt-in adapter: `use(snap)`. Not part of the auto bundle. */
export const snap: Adapter = {
  id: 'snap',
  detect: () => typeof g.snaptr === 'function',
  track(event, params, mapped, eventId) {
    const snaptr = g.snaptr;
    if (!snaptr) return false;
    const name = mapped ?? (hasOwn(MAP, event) ? MAP[event] : event);
    // client_dedup_id pairs with the server relay's event_id for CAPI dedup
    snaptr('track', name, { ...toSnapParams(params), client_dedup_id: eventId });
  },
  page() {
    g.snaptr?.('track', 'PAGE_VIEW');
  },
};
