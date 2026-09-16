import { defineConfig } from 'vitest/config';
import path from 'node:path';

const root = import.meta.dirname;

export default defineConfig({
  test: {
    environment: 'node',
    include: ['lib/**/*.test.ts', 'tests/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
    // First dynamic import of lib/env pulls zod in cold; 5s is too tight on
    // a slow disk and produces flaky failures that mean nothing.
    testTimeout: 20_000,
    hookTimeout: 20_000,
  },
  resolve: {
    alias: {
      '@': root,
      // `server-only` is a build-time guard; it has no meaning under Vitest.
      'server-only': path.resolve(root, 'tests/server-only-stub.ts'),
    },
  },
});
