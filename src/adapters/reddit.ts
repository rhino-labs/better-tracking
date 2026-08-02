import type { Adapter, CommonParams, EventParams } from '../types';

const g = globalThis as { rdt?: (...args: unknown[]) => void };

function toRedditParams(params: Readonly<EventParams>): Record<string, unknown> {
  const { items, ...rest } = params as CommonParams & EventParams;
  const p: Record<string, unknown> = { ...rest };
  if (items) p['itemCount'] = items.reduce((n, i) => n + (i.quantity ?? 1), 0);
  return p;
}

export const reddit: Adapter = {
  id: 'reddit',
  detect: () => typeof g.rdt === 'function',
  track(event, params, mapped, eventId) {
    const rdt = g.rdt;
    if (!rdt) return false;
    // conversionId pairs with the server relay's event_id for CAPI dedup
    const p = { ...toRedditParams(params), conversionId: eventId };
    if (mapped !== undefined) rdt('track', mapped, p);
    else rdt('track', 'Custom', { ...p, customEventName: event });
  },
  page() {
    g.rdt?.('track', 'PageVisit');
  },
};
