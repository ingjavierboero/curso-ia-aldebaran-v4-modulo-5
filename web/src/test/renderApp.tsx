import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../App';
import { createAppRouter, type AppRouter } from '../router';
import { useAuthStore } from '../store/authStore';

/** Routers en memoria creados en el test en curso; `setup.ts` los libera al terminar. */
const renderedRouters: AppRouter[] = [];

/** Monta la app completa (antd + data router en memoria) en `path`. */
export function renderApp(path: string) {
  const router = createAppRouter({ initialEntries: [path] });
  renderedRouters.push(router);
  const user = userEvent.setup();
  const view = render(<App router={router} />);
  return { router, user, view };
}

/** Libera los routers (aborta loaders en curso) para que nada del test anterior siga corriendo. */
export function disposeRenderedRouters(): void {
  for (const router of renderedRouters.splice(0)) router.dispose();
}

export function resetAuthStore(): void {
  useAuthStore.setState({ user: null, status: 'loading' });
}
