import type { Config, CustomParams, EmitterEvents, EventMap, PageProps, Traits } from './index.js';

/**
 * Script-tag configure also accepts plain relay values ('/api/events' or
 * true) — the dispatcher coerces them to relayTo(), since a paste-in snippet
 * can't carry a function.
 */
type BtConfig = Omit<Config, 'relay'> & { relay?: Config['relay'] | string | true };

/**
 * Global command dispatcher installed by the script-tag build (bt.js).
 * Mirrors the module API: bt('track', 'purchase', { value: 1, currency: 'USD' })
 */
interface BtCommand {
  <K extends keyof EventMap>(cmd: 'track', event: K, params?: EventMap[K]): void;
  (cmd: 'track', event: string, params?: CustomParams): void;
  (cmd: 'page', props?: PageProps): void;
  (cmd: 'identify', traits: Traits): void;
  (cmd: 'configure', config: BtConfig): void;
  <K extends keyof EmitterEvents>(cmd: 'on', name: K, fn: (payload: EmitterEvents[K]) => void): void;
  (cmd: 'detected'): void;
}

declare global {
  var bt: BtCommand;
}

export {};
