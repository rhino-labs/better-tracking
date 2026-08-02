/**
 * toNodeHandler — the Tier-3 Node-legacy shim (PRD §12.5): adapts
 * relay.handle(Request) to (req: IncomingMessage, res: ServerResponse) for
 * Express/Fastify/Koa and the Next Pages Router. Written once; the only real
 * adapter code in the integration surface. Structural types keep node:http
 * out of the type graph so edge-only consumers never see it.
 */
import type { Relay } from './server/index';

interface NodeRequestLike {
  method?: string;
  url?: string;
  headers: Record<string, string | string[] | undefined>;
  on(event: 'data', cb: (chunk: Uint8Array) => void): unknown;
  on(event: 'end' | 'error', cb: (err?: Error) => void): unknown;
}

interface NodeResponseLike {
  statusCode: number;
  setHeader(name: string, value: string): unknown;
  end(body?: string): unknown;
}

export type NodeHandler = (req: NodeRequestLike, res: NodeResponseLike) => Promise<void>;

function readBody(req: NodeRequestLike): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const chunks: BlobPart[] = [];
    // copy: Buffer views SharedArrayBuffer-typed memory in newer @types, Blob wants ArrayBuffer
    req.on('data', (c) => chunks.push(new Uint8Array(c)));
    req.on('error', (err) => reject(err ?? new Error('request stream error')));
    req.on('end', () => resolve(new Blob(chunks)));
  });
}

export function toNodeHandler(relay: Relay): NodeHandler {
  return async (req, res) => {
    try {
      const headers = new Headers();
      for (const [k, v] of Object.entries(req.headers)) {
        if (typeof v === 'string') headers.set(k, v);
        else if (Array.isArray(v)) headers.set(k, v.join(', '));
      }
      const method = req.method ?? 'GET';
      const init: RequestInit = { method, headers };
      if (method !== 'GET' && method !== 'HEAD') init.body = await readBody(req);
      const request = new Request(`http://relay.local${req.url ?? '/'}`, init);
      const response = await relay.handle(request);
      res.statusCode = response.status;
      response.headers.forEach((value, key) => res.setHeader(key, value));
      const text = await response.text();
      res.end(text === '' ? undefined : text);
    } catch {
      res.statusCode = 500;
      res.end();
    }
  };
}
