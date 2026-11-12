import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach, expect, vi } from 'vitest';
import { setUnauthorizedHandler } from '../api/authApi';
import { takeUnmatchedFetches } from './fetchMock';
import { disposeRenderedRouters, resetAuthStore } from './renderApp';

// jsdom no implementa matchMedia y antd (Grid, Form responsive) lo usa. antd 6 solo usa
// addEventListener/removeEventListener; los addListener/removeListener deprecados no hacen falta.
if (typeof window.matchMedia !== 'function') {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string): MediaQueryList => {
      const mql: Omit<MediaQueryList, 'addListener' | 'removeListener'> = {
        matches: false,
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      };
      return mql as MediaQueryList;
    },
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
