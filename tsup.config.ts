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
]);
