/**
 * Match-signal capture for the server relay (PRD §12.3): vendor cookies and
 * landing-URL click ids. Click ids are read once at init and held in memory —
 * no storage, no PII. Cookies are re-read per event (pixels set them late).
 */

const COOKIES = ['_fbp', '_fbc', '_ga', '_ttp'] as const;
const CLICK_IDS = ['fbclid', 'ttclid', 'li_fat_id', 'rdt_cid', 'twclid', 'gclid'] as const;

let clickIds: Record<string, string> | undefined;

function readCookie(name: string): string | undefined {
  if (typeof document === 'undefined') return undefined;
  const m = ('; ' + document.cookie).split('; ' + name + '=')[1];
  return m ? decodeURIComponent(m.split(';')[0] ?? '') : undefined;
}

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
  for (const name of COOKIES) {
    const v = readCookie(name);
    if (v !== undefined && v !== '') out[name] = v;
  }
  return out;
}
