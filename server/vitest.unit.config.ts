import { defineConfig } from 'vitest/config';

// Tests que no abren SQLite, no levantan la app HTTP ni usan red (ADR-010).
export default defineConfig({
  test: {
    name: 'server-unit',
    environment: 'node',
    include: ['test/unit/**/*.test.ts'],
  },
});
