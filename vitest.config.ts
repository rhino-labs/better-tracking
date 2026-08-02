import { defineConfig } from 'vitest/config';

export default defineConfig({
  define: { __DEV__: 'true' },
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    typecheck: {
      enabled: true,
      include: ['test/**/*.test-d.ts'],
    },
  },
});
