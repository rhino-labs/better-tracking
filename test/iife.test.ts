import { afterEach, describe, expect, it, vi } from 'vitest';

const g = globalThis as Record<string, unknown>;

afterEach(() => {
  delete g['bt'];
  delete g['fbq'];
  vi.resetModules();
});

describe('IIFE entry', () => {
  it('replays queued stub commands and installs the real dispatcher', async () => {
    const fbq = Object.assign(vi.fn(), { callMethod: () => undefined });
    g['fbq'] = fbq;

    // simulate the pre-load stub having queued a command
    const stub = Object.assign(() => undefined, {
      q: [['track', 'purchase', { value: 1, currency: 'USD' }]],
    });
    g['bt'] = stub;

    await import('../src/iife');

    expect(fbq).toHaveBeenCalledWith(
      'track',
      'Purchase',
      expect.objectContaining({ value: 1 }),
      { eventID: expect.any(String) },
    );

    // post-load calls go straight through
    (g['bt'] as (...a: unknown[]) => void)('track', 'sign_up');
    expect(fbq).toHaveBeenCalledWith('track', 'CompleteRegistration', {}, { eventID: expect.any(String) });
  });

  it('ignores non-command names and survives malformed queued commands', async () => {
    const fbq = Object.assign(vi.fn(), { callMethod: () => undefined });
    g['fbq'] = fbq;

    const stub = Object.assign(() => undefined, {
      q: [
        ['valueOf'], // Object.prototype member — must not be invoked
        ['createTracker'], // real export, but not an allowed command
        ['configure', null], // malformed args that throw inside the API
        ['track', 'sign_up'], // must still fire despite the garbage before it
      ],
    });
    g['bt'] = stub;

    await expect(import('../src/iife')).resolves.toBeDefined();
    expect(fbq).toHaveBeenCalledWith('track', 'CompleteRegistration', {}, { eventID: expect.any(String) });
  });
});
