import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { adapters } from '../src/adapters';
import { createTracker } from '../src/core';
import { warnMissingAdapters } from '../src/devwarn';
import { makeFbq } from './helpers';

const g = globalThis as Record<string, unknown>;

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  delete g['fbq'];
  delete g['pintrk'];
});

describe('dev missing-adapter warning', () => {
  it('warns once per on-page pixel whose adapter is not registered', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    g['fbq'] = makeFbq();
    const t = createTracker([]); // nothing registered
    warnMissingAdapters(t);

    vi.advanceTimersByTime(15000); // all three check ticks
    const messages = warn.mock.calls.map((c) => String(c[0]));
    expect(messages.filter((m) => m.includes('meta'))).toHaveLength(1);
    expect(messages[0]).toContain("better-tracking/adapters/meta");
  });

  it('stays silent for registered adapters and pixel-free vendors', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    g['fbq'] = makeFbq();
    const t = createTracker(adapters); // meta adapter registered
    warnMissingAdapters(t);
    vi.advanceTimersByTime(15000);
    expect(warn).not.toHaveBeenCalled();
  });

  it('catches opt-in vendors too (pinterest pixel, no adapter)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    g['pintrk'] = vi.fn();
    const t = createTracker(adapters); // built-ins only
    warnMissingAdapters(t);
    vi.advanceTimersByTime(15000);
    expect(warn.mock.calls.map((c) => String(c[0])).join('\n')).toContain('pinterest');
  });

  it('picks up pixels that appear late (GTM-style)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const t = createTracker([]);
    warnMissingAdapters(t);
    vi.advanceTimersByTime(2000); // first tick: nothing on page
    expect(warn).not.toHaveBeenCalled();
    g['fbq'] = makeFbq();
    vi.advanceTimersByTime(2000); // 3s tick sees it
    expect(warn).toHaveBeenCalledTimes(1);
  });
});

describe('auto entry', () => {
  it('registers all six built-in adapters on the shared tracker', async () => {
    const auto = await import('../src/auto');
    expect(new Set(await Promise.resolve(adapters.map((a) => a.id)))).toEqual(
      new Set(['meta', 'ga4', 'tiktok', 'linkedin', 'reddit', 'x']),
    );
    // the auto module re-exports the full API
    expect(typeof auto.track).toBe('function');
    expect(typeof auto.use).toBe('function');
  });
});
