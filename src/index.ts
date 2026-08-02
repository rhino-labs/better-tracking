import { adapters } from './adapters';
import { createTracker } from './core';
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
  RelayConfig,
  RelayPayload,
  Traits,
  ValueParams,
  VendorId,
} from './types';
export type { Tracker } from './core';
export { createTracker } from './core';
export { MAPPING } from './mapping';

const tracker = createTracker(adapters);

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
 * Register an opt-in adapter that isn't in the auto bundle:
 *
 *   import { use } from 'better-tracking';
 *   import { pinterest } from 'better-tracking/adapters/pinterest';
 *   use(pinterest);
 */
export function use(adapter: Adapter): void {
  tracker.use(adapter);
}
