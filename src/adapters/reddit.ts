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
  track(event, params, mapped) {
    const rdt = g.rdt;
    if (!rdt) return false;
    if (mapped !== undefined) rdt('track', mapped, toRedditParams(params));
    else rdt('track', 'Custom', { ...toRedditParams(params), customEventName: event });
  },
  page() {
    g.rdt?.('track', 'PageVisit');
  },
};
