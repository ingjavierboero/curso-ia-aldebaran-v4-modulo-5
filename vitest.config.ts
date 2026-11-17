import { defineConfig } from 'vitest/config';

// Vitest >= 4 ya no lee vitest.workspace.ts: los proyectos se declaran con test.projects.
export default defineConfig({
  test: {
    projects: ['server/vitest.unit.config.ts', 'server/vitest.integration.config.ts', 'web'],
    passWithNoTests: true,
  },
});
