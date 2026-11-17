import { defineConfig } from 'vitest/config';

// Tests que abren SQLite, levantan la app HTTP o usan red (ADR-010).
export default defineConfig({
  test: {
    name: 'server-integration',
    environment: 'node',
    include: ['test/integration/**/*.test.ts'],
  },
});
