import { defineConfig } from 'vitest/config';

// Vitest >= 4 ya no lee vitest.workspace.ts: los proyectos se declaran con test.projects.
export default defineConfig({
  test: {
    projects: ['server', 'web'],
    passWithNoTests: true,
  },
});
