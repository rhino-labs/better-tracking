import type { Config, CustomParams, EmitterEvents, EventMap, PageProps, Traits } from './index.js';

/**
 * Global command dispatcher installed by the script-tag build (bt.js).
 * Mirrors the module API: bt('track', 'purchase', { value: 1, currency: 'USD' })
 */
interface BtCommand {
  <K extends keyof EventMap>(cmd: 'track', event: K, params?: EventMap[K]): void;
  (cmd: 'track', event: string, params?: CustomParams): void;
  (cmd: 'page', props?: PageProps): void;
  (cmd: 'identify', traits: Traits): void;
  (cmd: 'configure', config: Config): void;
  <K extends keyof EmitterEvents>(cmd: 'on', name: K, fn: (payload: EmitterEvents[K]) => void): void;
  (cmd: 'detected'): void;
}

declare global {
  var bt: BtCommand;
}

export {};
