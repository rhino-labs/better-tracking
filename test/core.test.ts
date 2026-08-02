import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { adapters } from '../src/adapters';
import { createTracker } from '../src/core';

type G = Record<string, unknown>;
const g = globalThis as G;
const VENDOR_GLOBALS = ['fbq', 'gtag', 'dataLayer', 'ttq', 'lintrk', 'rdt', 'twq'];

const makeFbq = () => Object.assign(vi.fn(), { callMethod: () => undefined });

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  for (const name of VENDOR_GLOBALS) delete g[name];
});

describe('detection & dispatch', () => {
  it('dispatches a purchase to every pixel present at init with vendor-native names/params', () => {
    const fbq = (g['fbq'] = makeFbq());
    const gtag = (g['gtag'] = vi.fn());
    const ttqTrack = vi.fn();
    g['ttq'] = { track: ttqTrack };
    const rdt = (g['rdt'] = vi.fn());

    const t = createTracker(adapters);
    t.track('purchase', {
      value: 49.99,
      currency: 'USD',
      items: [{ id: 'sku1', price: 49.99, quantity: 1 }],
    });

    expect(fbq).toHaveBeenCalledWith(
      'track',
      'Purchase',
      expect.objectContaining({
        value: 49.99,
        currency: 'USD',
        content_ids: ['sku1'],
        contents: [{ id: 'sku1', quantity: 1, item_price: 49.99 }],
        content_type: 'product',
      }),
      { eventID: expect.any(String) },
    );
    expect(gtag).toHaveBeenCalledWith('event', 'purchase', expect.objectContaining({ value: 49.99 }));
    expect(ttqTrack).toHaveBeenCalledWith(
      'CompletePayment',
      expect.objectContaining({
        value: 49.99,
        contents: [{ content_id: 'sku1', content_name: undefined, quantity: 1, price: 49.99 }],
      }),
      { event_id: expect.any(String) },
    );
    expect(rdt).toHaveBeenCalledWith(
      'track',
      'Purchase',
      expect.objectContaining({ value: 49.99, itemCount: 1 }),
    );
  });

  it('queues events fired before any pixel exists and flushes on a later probe tick', () => {
    const t = createTracker(adapters);
    t.track('sign_up', { method: 'email' });

    const fbq = (g['fbq'] = makeFbq());
    expect(fbq).not.toHaveBeenCalled();

    vi.advanceTimersByTime(600); // first retry probe at 500ms
    expect(fbq).toHaveBeenCalledWith('track', 'CompleteRegistration', { method: 'email' }, { eventID: expect.any(String) });
  });

  it('re-probes on track() and replays the backlog to a late-detected vendor only once', () => {
    const fbq = (g['fbq'] = makeFbq());
    const t = createTracker(adapters);
    t.track('view_item', { items: [{ id: 'a' }] });
    expect(fbq).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(60000); // probe schedule exhausted
    const rdt = (g['rdt'] = vi.fn());
    t.track('add_to_cart', { value: 5, currency: 'USD' });

    // late vendor got the backlog (view_item) plus the new event
    expect(rdt).toHaveBeenCalledTimes(2);
    expect(rdt).toHaveBeenNthCalledWith(1, 'track', 'ViewContent', expect.anything());
    expect(rdt).toHaveBeenNthCalledWith(2, 'track', 'AddToCart', expect.anything());
    // early vendor received no duplicates of the first event
    expect(fbq).toHaveBeenCalledTimes(2);
  });

  it('caps the queue at 50 events (FIFO drop)', () => {
    const t = createTracker(adapters);
    for (let i = 0; i < 60; i++) t.track(`e${i}`);
    const fbq = (g['fbq'] = makeFbq());
    vi.advanceTimersByTime(600);
    expect(fbq).toHaveBeenCalledTimes(50);
    expect(fbq).toHaveBeenNthCalledWith(1, 'trackCustom', 'e10', {}, { eventID: expect.any(String) });
  });

  it('evicts fully-delivered history before pending events on overflow', () => {
    // all six vendors present → early events become fully-delivered history
    g['fbq'] = makeFbq();
    g['gtag'] = vi.fn();
    g['ttq'] = { track: vi.fn() };
    g['lintrk'] = vi.fn();
    g['rdt'] = vi.fn();
    g['twq'] = vi.fn();
    const t = createTracker(adapters);
    t.configure({ map: { delivered: { x: 'tw-1', linkedin: '1' } } });
    for (let i = 0; i < 55; i++) t.track('delivered');

    // undelivered pending entry survives 55 delivered ones
    t.configure({ consent: () => false });
    t.track('pending_event');
    const gtag = (g['gtag'] = vi.fn());
    t.configure({ consent: () => true });
    for (let i = 0; i < 10; i++) t.track('delivered');
    expect(gtag).toHaveBeenCalledWith('event', 'pending_event', {});
  });

  it('emits detect and dispatch events', () => {
    const t = createTracker(adapters);
    const detects: unknown[] = [];
    const dispatches: unknown[] = [];
    t.on('detect', (p) => detects.push(p));
    t.on('dispatch', (p) => dispatches.push(p));

    g['fbq'] = makeFbq();
    vi.advanceTimersByTime(600);
    t.track('search', { query: 'shoes' });

    expect(detects).toEqual([{ vendor: 'meta' }]);
    expect(dispatches).toEqual([
      {
        vendor: 'meta',
        type: 'track',
        event: 'search',
        params: { query: 'shoes' },
        event_id: expect.any(String),
      },
    ]);
  });
});

describe('vendor specifics', () => {
  it('falls back to dataLayer.push for GTM-only GA4 setups', () => {
    const dataLayer: Array<Record<string, unknown>> = [];
    g['dataLayer'] = dataLayer;
    const t = createTracker(adapters);
    t.track('purchase', { value: 10, currency: 'EUR' });
    expect(dataLayer).toEqual([{ event: 'purchase', value: 10, currency: 'EUR' }]);
  });

  it('sends custom events via each vendor custom mechanism', () => {
    const fbq = (g['fbq'] = makeFbq());
    const rdt = (g['rdt'] = vi.fn());
    const t = createTracker(adapters);
    t.track('demo_booked', { plan: 'pro' });
    expect(fbq).toHaveBeenCalledWith('trackCustom', 'demo_booked', { plan: 'pro' }, { eventID: expect.any(String) });
    expect(rdt).toHaveBeenCalledWith(
      'track',
      'Custom',
      expect.objectContaining({ plan: 'pro', customEventName: 'demo_booked' }),
    );
  });

  it('maps query to search_string for Meta', () => {
    const fbq = (g['fbq'] = makeFbq());
    const t = createTracker(adapters);
    t.track('search', { query: 'shoes' });
    expect(fbq).toHaveBeenCalledWith('track', 'Search', { search_string: 'shoes' }, { eventID: expect.any(String) });
  });

  it('skips x/linkedin without config.map, fires once configured', () => {
    const twq = (g['twq'] = vi.fn());
    const lintrk = (g['lintrk'] = vi.fn());
    const t = createTracker(adapters);

    t.track('purchase', { value: 1, currency: 'USD' });
    expect(twq).not.toHaveBeenCalled();
    expect(lintrk).not.toHaveBeenCalled();

    // configuring ids replays the skipped backlog, then new events flow through
    t.configure({ map: { purchase: { x: 'tw-abc-def', linkedin: '12345' } } });
    expect(twq).toHaveBeenCalledWith('event', 'tw-abc-def', { value: 1, currency: 'USD' });
    t.track('purchase', { value: 2, currency: 'USD' });
    expect(twq).toHaveBeenCalledWith('event', 'tw-abc-def', { value: 2, currency: 'USD' });
    expect(lintrk).toHaveBeenCalledTimes(2);
    expect(lintrk).toHaveBeenCalledWith('track', { conversion_id: 12345 });
  });

  it('does not resolve prototype members as mapped event names', () => {
    const fbq = (g['fbq'] = makeFbq());
    const rdt = (g['rdt'] = vi.fn());
    const t = createTracker(adapters);
    t.track('constructor');
    t.track('hasOwnProperty');
    expect(fbq).toHaveBeenCalledWith('trackCustom', 'constructor', {}, { eventID: expect.any(String) });
    expect(rdt).toHaveBeenCalledWith(
      'track',
      'Custom',
      expect.objectContaining({ customEventName: 'hasOwnProperty' }),
    );
  });

  it('does not treat a bare function without queue/callMethod as a Meta pixel', () => {
    g['fbq'] = vi.fn(); // no stub markers → not a real pixel snippet
    const t = createTracker(adapters);
    t.track('purchase', { value: 1, currency: 'USD' });
    expect(g['fbq']).not.toHaveBeenCalled();
    expect(t.detected()).not.toContain('meta');
  });
});

describe('config', () => {
  it('gates all dispatch behind consent and flushes when granted', () => {
    const fbq = (g['fbq'] = makeFbq());
    let granted = false;
    const t = createTracker(adapters);
    t.configure({ consent: () => granted });

    t.track('purchase', { value: 9, currency: 'USD' });
    expect(fbq).not.toHaveBeenCalled();

    granted = true;
    t.configure({}); // any configure/track/probe re-checks consent
    expect(fbq).toHaveBeenCalledTimes(1);
  });

  it('flushes pending events when consent is granted with no further calls', () => {
    const fbq = (g['fbq'] = makeFbq());
    let granted = false;
    const t = createTracker(adapters);
    t.configure({ consent: () => granted });
    t.track('purchase', { value: 9, currency: 'USD' });
    expect(fbq).not.toHaveBeenCalled();

    vi.advanceTimersByTime(30000); // probe schedule long over
    granted = true; // e.g. CMP banner click, no track/configure afterwards
    vi.advanceTimersByTime(600); // consent poll picks it up
    expect(fbq).toHaveBeenCalledTimes(1);
  });

  it('disable suppresses a detected vendor', () => {
    const fbq = (g['fbq'] = makeFbq());
    const rdt = (g['rdt'] = vi.fn());
    const t = createTracker(adapters);
    t.configure({ disable: ['meta'] });
    t.track('sign_up');
    expect(fbq).not.toHaveBeenCalled();
    expect(rdt).toHaveBeenCalled();
  });

  it('config.map overrides the built-in mapping', () => {
    const fbq = (g['fbq'] = makeFbq());
    const t = createTracker(adapters);
    t.configure({ map: { demo_booked: { meta: 'Schedule' } } });
    t.track('demo_booked');
    expect(fbq).toHaveBeenCalledWith('track', 'Schedule', {}, { eventID: expect.any(String) });
  });

  it('a throwing adapter never breaks the page or other vendors', () => {
    g['fbq'] = Object.assign(
      vi.fn(() => {
        throw new Error('boom');
      }),
      { callMethod: () => undefined },
    );
    const rdt = (g['rdt'] = vi.fn());
    const t = createTracker(adapters);
    expect(() => t.track('sign_up')).not.toThrow();
    expect(rdt).toHaveBeenCalled();
  });
});
