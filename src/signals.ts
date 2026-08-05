/**
 * Match-signal capture for the server relay (PRD §12.3): vendor cookies and
 * landing-URL click ids. Click ids are read once at init and held in memory —
 * no storage, no PII. Cookies are re-read per event (pixels set them late).
 */

import { CLICK_IDS, SIGNAL_COOKIES as COOKIES } from './signal-names';

let clickIds: Record<string, string> | undefined;

/** Capture click ids from the current URL (call once at init). */
export function captureClickIds(): void {
  if (clickIds !== undefined || typeof location === 'undefined') return;
  clickIds = {};
  const q = new URLSearchParams(location.search);
  for (const k of CLICK_IDS) {
    const v = q.get(k);
    if (v !== null && v !== '') clickIds[k] = v;
  }
}

export function collectSignals(): Record<string, string> {
  const out: Record<string, string> = { ...clickIds };
  if (typeof document !== 'undefined') {
    // one cookie-jar read per collect, not one per cookie name
    const jar = '; ' + document.cookie;
    for (const name of COOKIES) {
      const m = jar.split('; ' + name + '=')[1];
      const v = m ? decodeURIComponent(m.split(';')[0] ?? '') : '';
      if (v !== '') out[name] = v;
    }
  }
  return out;
}
