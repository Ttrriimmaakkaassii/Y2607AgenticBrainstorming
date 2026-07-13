import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  test: {
    environment: 'node',
    // functions/ is deliberately excluded from tsconfig.json (it's a
    // separately-bundled Cloudflare Pages Function, not part of the
    // Next.js app) — vitest resolves it directly via esbuild regardless,
    // so its pure/testable logic can still be unit tested from here.
    include: ['lib/**/*.test.ts', 'functions/**/*.test.ts'],
  },
});
