import { detectLinkedin } from '../detectors';
import type { Adapter } from '../types';

const g = globalThis as { lintrk?: (...args: unknown[]) => void };

/**
 * LinkedIn conversions require account-specific conversion_ids; without
 * config.map entries we skip (LinkedIn's own tag still auto-tracks pages).
 * Configure as: configure({ map: { purchase: { linkedin: '12345' } } })
 */
export const linkedin: Adapter = {
  id: 'linkedin',
  detect: detectLinkedin,
  track(_event, _params, mapped) {
    const lintrk = g.lintrk;
    if (!lintrk || mapped === undefined) return false;
    lintrk('track', { conversion_id: Number(mapped) });
  },
};
