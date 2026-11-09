import { createBrowserRouter, createMemoryRouter, redirect, type RouteObject } from 'react-router';
import { getSession, getSetupStatus, setUnauthorizedHandler } from './api/authApi';
import { FirstAdminPage } from './pages/FirstAdminPage';
import { HomePage } from './pages/HomePage';
import { LoginPage } from './pages/LoginPage';
import { useAuthStore } from './store/authStore';

/**
 * Guardas de navegación. Son UX: la autorización real es `authMiddleware` del server (Block 4).
 * Los loaders llaman a la API con `navigateOnUnauthorized: false` porque redirigen ellos.
 */

/** `/`: exige sesión. Sin sesión (401) o sin servidor, a `/login` (falla cerrado). */
async function homeLoader() {
  try {
    const user = await getSession({ navigateOnUnauthorized: false });
    useAuthStore.getState().setUser(user);
    return null;
  } catch {
    useAuthStore.getState().setAnon();
    return redirect('/login');
  }
}

/** `/login`: sistema vacío → `/setup`; ya hay sesión → `/`. Si el servidor no responde, se muestra el login. */
async function loginLoader() {
  try {
    const { needsFirstAdmin } = await getSetupStatus();
    if (needsFirstAdmin) return redirect('/setup');
  } catch {
    return null;
  }
  try {
    const user = await getSession({ navigateOnUnauthorized: false });
    useAuthStore.getState().setUser(user);
    return redirect('/');
  } catch {
    return null;
  }
}

/** `/setup`: solo con el sistema vacío; si no (o si no se puede saber), a `/login`. */
async function setupLoader() {
  try {
    const { needsFirstAdmin } = await getSetupStatus();
    return needsFirstAdmin ? null : redirect('/login');
  } catch {
    return redirect('/login');
  }
}

export const routes: RouteObject[] = [
  { path: '/', loader: homeLoader, Component: HomePage },
  { path: '/login', loader: loginLoader, Component: LoginPage },
  { path: '/setup', loader: setupLoader, Component: FirstAdminPage },
  { path: '*', loader: () => redirect('/') },
];

export type AppRouter = ReturnType<typeof createBrowserRouter>;

/**
 * Data router de la app: del navegador, o en memoria (tests) si se pasan `initialEntries`.
 * Registra la navegación a `/login` ante un 401 fuera del login (FR-09).
 */
export function createAppRouter(memory?: { initialEntries: string[] }): AppRouter {
  const router = memory ? createMemoryRouter(routes, memory) : createBrowserRouter(routes);
  setUnauthorizedHandler(() => {
    if (router.state.location.pathname !== '/login') void router.navigate('/login', { replace: true });
  });
  return router;
}
