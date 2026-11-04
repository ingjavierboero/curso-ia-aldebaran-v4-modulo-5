import { defineConfig } from 'vitest/config';

// Block 1: proyecto web vacío. Block 5 reemplaza esta config por vite.config.ts (jsdom + setupFiles).
export default defineConfig({
  test: {
    name: 'web',
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
    passWithNoTests: true,
  },
});
