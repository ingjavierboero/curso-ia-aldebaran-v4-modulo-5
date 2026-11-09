import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// Config única de Vite y de Vitest para la web (reemplaza el `vitest.config.ts` de Block 1).
export default defineConfig({
  plugins: [react()],
  server: {
    // La cookie `aldebaran_sid` es SameSite=Strict: el proxy mantiene web y API en el mismo origen.
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
  test: {
    name: 'web',
    environment: 'jsdom',
    setupFiles: ['src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
