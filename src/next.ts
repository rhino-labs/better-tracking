/**
 * better-tracking/next — Next.js integration (PRD §12.5 Tier 1).
 * Zero relay logic here: config parsing, validation, hashing, and sending all
 * live in better-tracking/server. Runs on Node or Edge runtime unchanged.
 */
import { createRelay } from './server/index';
import { toNodeHandler, type NodeHandler } from './node';
import type { RelayOptions } from './server/types';

export type { RelayOptions } from './server/types';
export { createRelay } from './server/index';

/**
 * App Router route handlers:
 *
 *   // app/api/events/route.ts
 *   export const { POST } = createNextRoute({ meta: { pixelId, accessToken } });
 */
export function createNextRoute(options: RelayOptions): {
  POST: (req: Request) => Promise<Response>;
} {
  const relay = createRelay(options);
  return { POST: (req) => relay.handle(req) };
}

/**
 * Legacy Pages Router (pages/api/events.ts) — NextApiRequest/NextApiResponse
 * are structurally Node IncomingMessage/ServerResponse, so the Node shim covers it:
 *
 *   export default createPagesApiHandler({ ... });
 *   export const config = { api: { bodyParser: false } };
 */
export function createPagesApiHandler(options: RelayOptions): NodeHandler {
  return toNodeHandler(createRelay(options));
}
