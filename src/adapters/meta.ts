import { metaContents } from '../contents';
import type { Adapter, CommonParams, EventParams } from '../types';

interface Fbq {
  (...args: unknown[]): void;
  callMethod?: unknown;
  queue?: unknown[];
}

const g = globalThis as { fbq?: Fbq };

function toMetaParams(params: Readonly<EventParams>): Record<string, unknown> {
  const { items, query, ...rest } = params as CommonParams & EventParams;
  const p: Record<string, unknown> = { ...rest };
  if (query !== undefined) {
    delete p['query'];
    p['search_string'] = query;
  }
  if (items) {
    p['contents'] = metaContents(items);
    const ids = items.map((i) => i.id).filter((id): id is string => id !== undefined);
    if (ids.length > 0) p['content_ids'] = ids;
    p['content_type'] = 'product';
  }
  return p;
}

export const meta: Adapter = {
  id: 'meta',
  // A valid stub (pre-SDK snippet) counts as detected: calling it queues natively.
  detect: () => typeof g.fbq === 'function' && !!(g.fbq.callMethod ?? g.fbq.queue),
  track(event, params, mapped, eventId) {
    const fbq = g.fbq;
    if (!fbq) return false;
    // eventID pairs with the server relay's event_id for CAPI dedup
    const p = toMetaParams(params);
    const opt = { eventID: eventId };
    if (mapped !== undefined) fbq('track', mapped, p, opt);
    else fbq('trackCustom', event, p, opt);
  },
  page() {
    g.fbq?.('track', 'PageView');
  },
};
