import { tiktokContents } from '../contents';
import { hashEmail, hashPhone } from '../hash';
import type { Adapter, CommonParams, EventParams } from '../types';

interface Ttq {
  track: (name: string, params?: Record<string, unknown>, opts?: { event_id: string }) => void;
  page?: () => void;
  identify?: (traits: Record<string, unknown>) => void;
}

const g = globalThis as { ttq?: Ttq };

function toTikTokParams(params: Readonly<EventParams>): Record<string, unknown> {
  const { items, ...rest } = params as CommonParams & EventParams;
  const p: Record<string, unknown> = { ...rest };
  if (items) p['contents'] = tiktokContents(items);
  return p;
}

export const tiktok: Adapter = {
  id: 'tiktok',
  detect: () => typeof g.ttq?.track === 'function',
  track(event, params, mapped, eventId) {
    const ttq = g.ttq;
    if (!ttq) return false;
    // event_id pairs with the server relay's event_id for Events API dedup
    ttq.track(mapped ?? event, toTikTokParams(params), { event_id: eventId });
  },
  page() {
    g.ttq?.page?.();
  },
  identify(traits) {
    const ttq = g.ttq;
    if (typeof ttq?.identify !== 'function') return;
    // TikTok requires SHA-256 hashed email/phone; hashing is async so the
    // identify call fires when digests resolve (order vs later events is
    // vendor-side anyway)
    void (async () => {
      try {
        const t: Record<string, unknown> = {};
        if (traits.email !== undefined) t['email'] = await hashEmail(traits.email);
        if (traits.phone !== undefined) t['phone_number'] = await hashPhone(traits.phone);
        if (traits.user_id !== undefined) t['external_id'] = traits.user_id;
        if (Object.keys(t).length > 0) ttq.identify?.(t);
      } catch {
        /* SubtleCrypto unavailable (insecure context): skip identify */
      }
    })();
  },
};
