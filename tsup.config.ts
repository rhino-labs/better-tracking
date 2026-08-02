import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: {
      index: 'src/index.ts',
      'adapters/meta': 'src/adapters/meta.ts',
      'adapters/ga4': 'src/adapters/ga4.ts',
      'adapters/tiktok': 'src/adapters/tiktok.ts',
      'adapters/linkedin': 'src/adapters/linkedin.ts',
      'adapters/reddit': 'src/adapters/reddit.ts',
      'adapters/x': 'src/adapters/x.ts',
      'adapters/pinterest': 'src/adapters/pinterest.ts',
      'adapters/snap': 'src/adapters/snap.ts',
      'adapters/bing': 'src/adapters/bing.ts',
      server: 'src/server/index.ts',
      next: 'src/next.ts',
      'tanstack-start': 'src/tanstack-start.ts',
      node: 'src/node.ts',
    },
    format: ['esm'],
    dts: true,
    clean: true,
    minify: true,
    treeshake: true,
    target: 'es2020',
  },
  {
    entry: { bt: 'src/iife.ts' },
    format: ['iife'],
    minify: true,
    target: 'es2020',
    outExtension: () => ({ js: '.js' }),
  },
  {
    // dev-only debug build: no size budget, not minified for readable stacks
    entry: { 'bt.debug': 'src/debug.ts' },
    format: ['iife'],
    minify: false,
    target: 'es2020',
    outExtension: () => ({ js: '.js' }),
  },
]);
