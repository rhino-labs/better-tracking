/**
 * Server-side match-signal extraction: pick the vendor cookies and click ids
 * the relay cares about out of a Cookie header (or an already-parsed cookie
 * record), for callers that capture signals at one point (e.g. checkout
 * creation) and replay them later via relay.send(). Mirrors the client
 * collector's list via the shared signal-names module.
 */
import { CLICK_IDS, SIGNAL_COOKIES } from '../signal-names';

const SIGNAL_NAMES: readonly string[] = [...SIGNAL_COOKIES, ...CLICK_IDS];

/**
 * Extract match signals from a `Cookie` request header or a parsed
 * name → value record. Returns only the names the senders consume
 * (`_ga`, `_fbp`, `_fbc`, `_ttp` plus click ids), ready to pass as
 * `SendOptions.signals`.
 */
export function signalsFromCookies(
  source: string | Record<string, string | undefined> | null | undefined,
): Record<string, string> {
  const jar: Record<string, string> = {};
  if (typeof source === 'string') {
    for (const part of source.split(';')) {
      const eq = part.indexOf('=');
      if (eq === -1) continue;
      const name = part.slice(0, eq).trim();
      let value = part.slice(eq + 1).trim();
      try {
        value = decodeURIComponent(value);
      } catch {
        /* keep the raw value — a malformed escape is still a usable cookie */
      }
      if (name !== '' && value !== '') jar[name] = value;
    }
  } else if (source !== null && source !== undefined) {
    for (const [name, value] of Object.entries(source)) {
      if (typeof value === 'string' && value !== '') jar[name] = value;
    }
  }
  const out: Record<string, string> = {};
  for (const name of SIGNAL_NAMES) {
    const v = jar[name];
    if (v !== undefined) out[name] = v;
  }
  return out;
}
