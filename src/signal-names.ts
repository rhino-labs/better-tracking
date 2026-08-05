/**
 * The one list of match-signal names, shared by the client collector
 * (signals.ts) and the server-side cookie helper (server/signals.ts) so the
 * two can never drift apart.
 */

export const SIGNAL_COOKIES = ['_fbp', '_fbc', '_ga', '_ttp'] as const;
export const CLICK_IDS = ['fbclid', 'ttclid', 'li_fat_id', 'rdt_cid', 'twclid', 'gclid'] as const;
