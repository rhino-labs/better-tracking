import { configure, detected, identify, on, page, track } from './index';
import { hasOwn } from './mapping';

/**
 * Installs the global `bt` command dispatcher and replays any pre-load
 * command-queue stub:
 *   <script>window.bt=window.bt||function(){(bt.q=bt.q||[]).push(arguments)}</script>
 *   <script src=".../bt.js" defer></script>
 *   <script>bt('track', 'purchase', { value: 49.99, currency: 'USD' })</script>
 *
 * Kept as an exported function (not a bare side-effect module) so both bt.js
 * and bt.debug.js can call it without fighting `sideEffects: false`.
 */
type Command = [name: string, ...args: unknown[]];
interface Stub {
  (...args: Command): void;
  q?: Command[] | IArguments[];
}

const w = globalThis as { bt?: Stub };

// The typed dispatch table doubles as the allowlist: names not in it (incl.
// Object.prototype members) never resolve. `use()` is deliberately absent —
// opt-in adapters take object arguments the string dispatcher can't carry,
// so they are ESM-only.
const CMDS = { track, page, identify, configure, on, detected };

const run = (...cmd: Command): void => {
  const [name, ...args] = cmd;
  if (!hasOwn(CMDS, name)) return;
  try {
    // overloaded signatures (track) don't fit a uniform table type; the
    // hasOwn gate above makes the loose call safe
    (CMDS as unknown as Record<string, (...a: unknown[]) => void>)[name]?.(...args);
  } catch {
    /* a malformed command must not break the page or drop the rest of the queue */
  }
};

export function installBt(): void {
  const queued = w.bt?.q ?? [];
  w.bt = run;
  // IArguments is iterable, so spread handles both stored shapes
  for (const cmd of queued) run(...(cmd as Command));
}
