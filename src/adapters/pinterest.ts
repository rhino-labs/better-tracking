import { detectPinterest } from '../detectors';
import { hasOwn } from '../mapping';
import type { Adapter, CommonParams, EventParams } from '../types';

const g = globalThis as { pintrk?: (...args: unknown[]) => void };

// Pinterest tag event vocabulary; unmapped events fall through as custom names.
const MAP: Record<string, string> = {
  page_view: 'pagevisit',
  view_item: 'viewcategory',
  search: 'search',
  add_to_cart: 'addtocart',
  begin_checkout: 'checkout',
  purchase: 'checkout',
  sign_up: 'signup',
  generate_lead: 'lead',
};

function toPinterestParams(params: Readonly<EventParams>): Record<string, unknown> {
  const { items, ...rest } = params as CommonParams & EventParams;
  const p: Record<string, unknown> = { ...rest };
  if (items) {
    p['line_items'] = items.map((i) => ({
      product_id: i.id,
      product_name: i.name,
      product_price: i.price,
      product_quantity: i.quantity ?? 1,
    }));
    p['order_quantity'] = items.reduce((n, i) => n + (i.quantity ?? 1), 0);
  }
  return p;
}

/** Opt-in adapter: `use(pinterest)`. Not part of the auto bundle. */
export const pinterest: Adapter = {
  id: 'pinterest',
  detect: detectPinterest,
  track(event, params, mapped) {
    const pintrk = g.pintrk;
    if (!pintrk) return false;
    const name = mapped ?? (hasOwn(MAP, event) ? MAP[event] : event);
    pintrk('track', name, toPinterestParams(params));
  },
  page() {
    g.pintrk?.('track', 'pagevisit');
  },
};
