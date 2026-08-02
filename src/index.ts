import { createTracker } from './core';
import { warnMissingAdapters } from './devwarn';
import type {
  Adapter,
  Config,
  CustomParams,
  EmitterEvents,
  EventMap,
  EventParams,
  PageProps,
  Traits,
  VendorId,
} from './types';

export type {
  Adapter,
  Config,
  CustomParams,
  EmitterEvents,
  EventMap,
  EventParams,
  Item,
  KnownEvent,
  PageProps,
  RelayPayload,
  Traits,
  ValueParams,
  VendorId,
} from './types';
export type { Tracker } from './core';
export { createTracker } from './core';
export { MAPPING } from './mapping';
export { relayTo } from './relay';
export type { RelayEvent, RelayTarget, RelayTransport } from './types';

// Replaced at build time: false in production entries (the __DEV__ branch and
// everything it references tree-shake away), true in the `development`
// export-condition build and bt.debug.js.
declare const __DEV__: boolean;

// Core ships with NO adapters — register them via use(), one import each, or
// import from 'better-tracking/auto' to get all six built-ins.
const tracker = createTracker([]);

if (__DEV__) warnMissingAdapters(tracker);

/**
 * Params tuple per event: known events get their exact param type (optional
 * when every param is optional); unregistered custom events get a loose record.
 */
type TrackArgs<K> = K extends keyof EventMap
  ? Record<string, never> extends EventMap[K]
    ? [params?: EventMap[K]]
    : [params: EventMap[K]]
  : [params?: CustomParams];

export function track<K extends keyof EventMap | (string & {})>(
  event: K,
  ...args: TrackArgs<K>
): void;
export function track(event: string, params?: object): void {
  tracker.track(event, params as EventParams | undefined);
}

export function page(props?: PageProps): void {
  tracker.page(props);
}

export function identify(traits: Traits): void {
  tracker.identify(traits);
}

export function configure(config: Config): void {
  tracker.configure(config);
}

export function on<K extends keyof EmitterEvents>(
  name: K,
  fn: (payload: EmitterEvents[K]) => void,
): () => void {
  return tracker.on(name, fn);
}

export function detected(): VendorId[] {
  return tracker.detected();
}

/**
 * Register an adapter (all adapters are opt-in on this entry; the auto entry
 * and bt.js register the six built-ins for you):
 *
 *   import { use } from 'better-tracking';
 *   import { meta } from 'better-tracking/adapters/meta';
 *   use(meta);
 */
export function use(adapter: Adapter): void {
  tracker.use(adapter);
}
