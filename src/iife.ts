import * as api from './index';

/**
 * Script-tag entry. Replays any pre-load command-queue stub:
 *   <script>window.bt=window.bt||function(){(bt.q=bt.q||[]).push(arguments)}</script>
 *   <script src=".../bt.js" defer></script>
 *   <script>bt('track', 'purchase', { value: 49.99, currency: 'USD' })</script>
 */
type Command = [name: string, ...args: unknown[]];
interface Stub {
  (...args: Command): void;
  q?: Command[] | IArguments[];
}

const w = globalThis as { bt?: Stub };

const COMMANDS: readonly string[] = ['track', 'page', 'identify', 'configure', 'on', 'detected'];

const run = (...cmd: Command): void => {
  const [name, ...args] = cmd;
  // allowlist: never resolve arbitrary names (Object.prototype members,
  // non-command exports) through the namespace object
  if (!COMMANDS.includes(name)) return;
  const fn = (api as Record<string, unknown>)[name];
  if (typeof fn === 'function') {
    try {
      (fn as (...a: unknown[]) => void)(...args);
    } catch {
      /* a malformed command must not break the page or drop the rest of the queue */
    }
  }
};

const queued = w.bt?.q ?? [];
w.bt = run;
for (const cmd of queued) run(...(Array.from(cmd) as Command));
