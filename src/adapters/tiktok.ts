import type { Adapter, CommonParams, EventParams } from '../types';

interface Ttq {
  track: (name: string, params?: Record<string, unknown>) => void;
  page?: () => void;
}

const g = globalThis as { ttq?: Ttq };

function toTikTokParams(params: Readonly<EventParams>): Record<string, unknown> {
  const { items, ...rest } = params as CommonParams & EventParams;
  const p: Record<string, unknown> = { ...rest };
  if (items) {
    p['contents'] = items.map((i) => ({
      content_id: i.id,
      content_name: i.name,
      quantity: i.quantity ?? 1,
      price: i.price,
    }));
  }
  return p;
}

export const tiktok: Adapter = {
  id: 'tiktok',
  detect: () => typeof g.ttq?.track === 'function',
  track(event, params, mapped) {
    const ttq = g.ttq;
    if (!ttq) return false;
    ttq.track(mapped ?? event, toTikTokParams(params));
  },
  page() {
    g.ttq?.page?.();
  },
};
