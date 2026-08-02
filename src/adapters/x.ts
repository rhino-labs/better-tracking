import { detectX } from '../detectors';
import type { Adapter, CommonParams, EventParams } from '../types';

const g = globalThis as { twq?: (...args: unknown[]) => void };

/**
 * X conversion events require per-account event ids (tw-…); without
 * config.map entries we skip (the base pixel still auto-tracks page views).
 * Configure as: configure({ map: { purchase: { x: 'tw-xxxxx-yyyyy' } } })
 */
export const x: Adapter = {
  id: 'x',
  detect: detectX,
  track(_event, params, mapped) {
    const twq = g.twq;
    if (!twq || mapped === undefined) return false;
    const { value, currency } = params as CommonParams & EventParams;
    const p: Record<string, unknown> = {};
    if (value !== undefined) p['value'] = value;
    if (currency !== undefined) p['currency'] = currency;
    twq('event', mapped, p);
  },
  page() {
    g.twq?.('track', 'PageView');
  },
};
