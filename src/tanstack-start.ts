/**
 * better-tracking/tanstack-start — TanStack Start integration (PRD §12.5 Tier 1).
 * Zero relay logic; returns the server-route handler map TanStack Start expects.
 * Structural types only — no dependency on @tanstack/react-start.
 */
import { createRelay } from './server/index';
import type { RelayOptions } from './server/types';

export type { RelayOptions } from './server/types';
export { createRelay } from './server/index';

export interface StartRouteHandlers {
  POST: (ctx: { request: Request }) => Promise<Response>;
}

/**
 *   // src/routes/api/events.ts
 *   import { createServerFileRoute } from '@tanstack/react-start/server';
 *   import { createStartRoute } from 'better-tracking/tanstack-start';
 *
 *   export const ServerRoute = createServerFileRoute('/api/events').methods(
 *     createStartRoute({ meta: { ... } }),
 *   );
 */
export function createStartRoute(options: RelayOptions): StartRouteHandlers {
  const relay = createRelay(options);
  return { POST: ({ request }) => relay.handle(request) };
}
