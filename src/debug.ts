/**
 * bt.debug.js — dev-only script-tag build (PRD §7.5). Same API and stub
 * replay as bt.js, plus rich console output. No size constraint; never ship
 * this to production pages.
 */
import { adapters } from './adapters';
import { configure, detected, on, use } from './index';
import { installBt } from './install';
import type { VendorId } from './types';

const HINTS: Partial<Record<VendorId, string>> = {
  x: "X conversion events need per-event ids — configure({ map: { purchase: { x: 'tw-xxxxx-yyyyy' } } }). Without them only the base pixel fires.",
  linkedin:
    "LinkedIn conversions need conversion_ids — configure({ map: { purchase: { linkedin: '12345' } } }). Without them only LinkedIn's automatic page tracking runs.",
};

for (const adapter of adapters) use(adapter);
installBt();
configure({ debug: true });

on('detect', ({ vendor }) => {
  console.info(`[bt] detected: ${vendor} (now: ${detected().join(', ')})`);
  const hint = HINTS[vendor];
  if (hint !== undefined) console.info('[bt] hint:', hint);
});

on('dispatch', ({ vendor, type, event, params, event_id }) => {
  console.table([
    {
      time: new Date().toISOString().slice(11, 23),
      type,
      vendor,
      event: event ?? '',
      event_id,
      params: params ? JSON.stringify(params) : '',
    },
  ]);
});

on('relay', ({ url, payload }) => {
  console.info(`[bt] relay → ${url}`, payload);
});

on('relay-error', ({ url, error }) => {
  console.warn(`[bt] relay failed → ${url}`, error);
});

console.info(
  '[bt] debug build active — dispatches are tabled, detection and relay are logged. Swap in bt.js for production.',
);
