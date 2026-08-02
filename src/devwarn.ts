import { DETECTORS } from './detectors';
import type { Tracker } from './core';
import type { VendorId } from './types';

/**
 * Dev-build-only (see the `development` export condition + __DEV__ define):
 * probes ALL known vendors — including ones with no registered adapter — and
 * warns when a pixel is live on the page that better-tracking will silently
 * not deliver to. Checks run on a few delayed ticks to catch GTM-late pixels.
 * The whole module (and the DETECTORS table) tree-shakes out of production
 * builds.
 */
export function warnMissingAdapters(tracker: Tracker): void {
  if (typeof setTimeout !== 'function' || typeof console === 'undefined') return;
  const warned = new Set<VendorId>();
  const check = (): void => {
    const registered = new Set(tracker.vendors());
    for (const [id, detect] of Object.entries(DETECTORS) as Array<[VendorId, () => boolean]>) {
      if (warned.has(id) || registered.has(id)) continue;
      try {
        if (!detect()) continue;
      } catch {
        continue;
      }
      warned.add(id);
      console.warn(
        `[bt] A ${id} pixel is on this page but its better-tracking adapter is not registered — ` +
          `track() calls will NOT reach it. Fix: import { ${id} } from 'better-tracking/adapters/${id}'; use(${id}); ` +
          `or import from 'better-tracking/auto' to register all built-in adapters. ` +
          `(This check only runs in development builds.)`,
      );
    }
  };
  // mirror the tail of the detector's own probe schedule
  for (const delay of [1000, 3000, 12000]) setTimeout(check, delay);
}
