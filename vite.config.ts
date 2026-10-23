import path from 'path';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// CI sets PERF_TOLERANCE (see tests/perf.ts); the default 5 s per-test timeout scales with it.
const perfTolerance = Math.max(1, Number(process.env.PERF_TOLERANCE) || 1);

export default defineConfig({
  server: {
    port: 3000,
    host: '0.0.0.0',
  },
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    testTimeout: 5000 * perfTolerance,
  },
});
