import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach, expect, vi } from 'vitest';
import { setUnauthorizedHandler } from '../api/authApi';
import { takeUnmatchedFetches } from './fetchMock';
import { disposeRenderedRouters, resetAuthStore } from './renderApp';

// jsdom no implementa matchMedia y antd (Grid, Form responsive) lo usa.
if (typeof window.matchMedia !== 'function') {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string): MediaQueryList =>
      ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }) as MediaQueryList,
  });
}

// Estado global de la app: cada test arranca sin usuario y sin handler de 401 de un router anterior.
beforeEach(() => {
  resetAuthStore();
  setUnauthorizedHandler(null);
});

afterEach(() => {
  cleanup();
  disposeRenderedRouters();
  setUnauthorizedHandler(null);
  resetAuthStore();
  vi.unstubAllGlobals();
  // Una llamada a una ruta que el test no declaró es un error del test, no un detalle.
  expect(takeUnmatchedFetches(), 'fetch a rutas no simuladas').toEqual([]);
});
