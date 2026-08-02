import { afterEach, describe, expect, it, vi } from 'vitest';
import { adapters } from '../src/adapters';
import { bing } from '../src/adapters/bing';
import { pinterest } from '../src/adapters/pinterest';
import { snap } from '../src/adapters/snap';
import { createTracker } from '../src/core';

const g = globalThis as Record<string, unknown>;

afterEach(() => {
  for (const n of ['pintrk', 'snaptr', 'uetq']) delete g[n];
});

describe('opt-in adapters via use()', () => {
  it('pinterest maps events and items to line_items', () => {
    const pintrk = (g['pintrk'] = vi.fn());
    const t = createTracker(adapters);
    t.use(pinterest);
    t.track('purchase', { value: 20, currency: 'USD', items: [{ id: 'a', quantity: 2 }] });
    expect(pintrk).toHaveBeenCalledWith(
      'track',
      'checkout',
      expect.objectContaining({
        value: 20,
        order_quantity: 2,
        line_items: [expect.objectContaining({ product_id: 'a', product_quantity: 2 })],
      }),
    );
  });

  it('snap maps value to price and carries client_dedup_id', () => {
    const snaptr = (g['snaptr'] = vi.fn());
    const t = createTracker(adapters);
    t.use(snap);
    t.track('purchase', { value: 9, currency: 'USD' });
    expect(snaptr).toHaveBeenCalledWith(
      'track',
      'PURCHASE',
      expect.objectContaining({ price: 9, currency: 'USD', client_dedup_id: expect.any(String) }),
    );
  });

  it('bing pushes GA4-style events onto uetq with revenue_value', () => {
    const push = vi.fn();
    g['uetq'] = { push };
    const t = createTracker(adapters);
    t.use(bing);
    t.track('purchase', { value: 3, currency: 'USD' });
    expect(push).toHaveBeenCalledWith('event', 'purchase', expect.objectContaining({ revenue_value: 3 }));
  });

  it('use() replays the queued backlog to a newly registered adapter', () => {
    const t = createTracker(adapters);
    t.track('sign_up');
    const pintrk = (g['pintrk'] = vi.fn());
    t.use(pinterest);
    expect(pintrk).toHaveBeenCalledWith('track', 'signup', expect.anything());
  });
});
