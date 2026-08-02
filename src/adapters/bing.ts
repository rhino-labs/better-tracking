import { detectBing } from '../detectors';
import type { Adapter, CommonParams, EventParams } from '../types';

// the pre-SDK uetq array and the loaded SDK object are both used only via .push
const g = globalThis as { uetq?: { push: (...args: unknown[]) => void } };

function toUetParams(params: Readonly<EventParams>): Record<string, unknown> {
  const { value, currency, items, query, ...rest } = params as CommonParams & EventParams;
  const p: Record<string, unknown> = { ...rest };
  if (value !== undefined) p['revenue_value'] = value;
  if (currency !== undefined) p['currency'] = currency;
  if (query !== undefined) p['search_term'] = query;
  if (items) {
    p['ecomm_prodid'] = items.map((i) => i.id).filter((id) => id !== undefined);
  }
  return p;
}

/**
 * Microsoft Advertising UET. Opt-in adapter: `use(bing)`. Not part of the
 * auto bundle. UET takes GA4-style event names, so unmapped events pass as-is.
 */
export const bing: Adapter = {
  id: 'bing',
  detect: detectBing,
  track(event, params, mapped) {
    const uetq = g.uetq;
    if (!uetq) return false;
    uetq.push('event', mapped ?? event, toUetParams(params));
  },
  page() {
    g.uetq?.push('event', 'page_view', {});
  },
};
