import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { adapters } from '../src/adapters';
import { createTracker } from '../src/core';
import type { RelayPayload } from '../src/types';

type G = Record<string, unknown>;
const g = globalThis as G;

const lastBeaconJson = (beacon: ReturnType<typeof vi.fn>): Promise<RelayPayload> => {
  const blob = beacon.mock.calls.at(-1)?.[1] as Blob;
  return blob.text().then((t) => JSON.parse(t) as RelayPayload);
};

describe('relay transport (client)', () => {
  let beacon: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    beacon = vi.fn(() => true);
    Object.defineProperty(globalThis, 'navigator', {
      value: { sendBeacon: beacon },
      configurable: true,
      writable: true,
    });
  });

  afterEach(() => {
    delete (globalThis as { navigator?: unknown }).navigator;
    delete g['fbq'];
    vi.restoreAllMocks();
  });

  it('beacons a versioned payload with event_id and empty sent list when no pixels exist', async () => {
    const t = createTracker(adapters);
    t.configure({ relay: true });
    t.track('purchase', { value: 5, currency: 'USD' });

    expect(beacon).toHaveBeenCalledWith('/api/events', expect.any(Blob));
    const payload = await lastBeaconJson(beacon);
    expect(payload).toMatchObject({
      v: 1,
      type: 'track',
      event: 'purchase',
      params: { value: 5, currency: 'USD' },
      sent: [],
    });
    expect(payload.event_id).toEqual(expect.any(String));
    expect(payload.ts).toEqual(expect.any(Number));
  });

  it('marks vendors the pixel path delivered to, and shares the same event_id with pixels', async () => {
    const fbq = Object.assign(vi.fn(), { callMethod: () => undefined });
    g['fbq'] = fbq;
    const t = createTracker(adapters);
    t.configure({ relay: '/collect' });
    t.track('sign_up');

    const payload = await lastBeaconJson(beacon);
    expect(payload.sent).toEqual(['meta']);
    // 4th fbq arg carries the same id for CAPI dedup
    expect(fbq).toHaveBeenCalledWith('track', 'CompleteRegistration', {}, { eventID: payload.event_id });
  });

  it('relays each event exactly once even as later probes run', () => {
    const t = createTracker(adapters);
    t.configure({ relay: true });
    t.track('sign_up');
    const calls = beacon.mock.calls.length;
    t.configure({}); // triggers another probe+flush
    expect(beacon.mock.calls.length).toBe(calls);
  });

  it('falls back to fetch keepalive when sendBeacon is unavailable, and emits relay events', () => {
    delete (globalThis as { navigator?: unknown }).navigator;
    const fetchMock = vi.fn(() => Promise.resolve(new Response(null, { status: 202 })));
    vi.stubGlobal('fetch', fetchMock);

    const t = createTracker(adapters);
    const relayed: unknown[] = [];
    t.on('relay', (p) => relayed.push(p));
    t.configure({ relay: { url: '/collect', headers: { 'x-key': 'k' } } });
    t.track('sign_up');

    expect(fetchMock).toHaveBeenCalledWith(
      '/collect',
      expect.objectContaining({
        method: 'POST',
        keepalive: true,
        headers: expect.objectContaining({ 'x-key': 'k' }),
      }),
    );
    expect(relayed).toHaveLength(1);
    vi.unstubAllGlobals();
  });

  it('emits relay-error when fetch rejects', async () => {
    delete (globalThis as { navigator?: unknown }).navigator;
    const fetchMock = vi.fn(() => Promise.reject(new Error('offline')));
    vi.stubGlobal('fetch', fetchMock);

    const t = createTracker(adapters);
    const errors: unknown[] = [];
    t.on('relay-error', (p) => errors.push(p));
    t.configure({ relay: true });
    t.track('sign_up');
    await vi.waitFor(() => expect(errors).toHaveLength(1));
    vi.unstubAllGlobals();
  });

  it('respects the consent gate: no beacon until granted', () => {
    let granted = false;
    const t = createTracker(adapters);
    t.configure({ relay: true, consent: () => granted });
    t.track('purchase', { value: 1, currency: 'USD' });
    expect(beacon).not.toHaveBeenCalled();

    granted = true;
    t.configure({});
    expect(beacon).toHaveBeenCalledTimes(1);
  });

  it('applies the transform hook to the payload', async () => {
    const t = createTracker(adapters);
    t.configure({ relay: { url: '/x', transform: (p) => ({ wrapped: p.event }) } });
    t.track('sign_up');
    const blob = beacon.mock.calls.at(-1)?.[1] as Blob;
    expect(JSON.parse(await blob.text())).toEqual({ wrapped: 'sign_up' });
  });
});
