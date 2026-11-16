import {
  createBrowserRouter,
  createMemoryRouter,
  redirect,
  type LoaderFunctionArgs,
  type RouteObject,
} from 'react-router';
import {
  ApiError,
  INVALID_RESET_LINK_MESSAGE,
  checkResetToken,
  errorText,
  getSession,
  getSetupStatus,
  setUnauthorizedHandler,
} from './api/authApi';
import type { PublicUser } from './api/types';
import { ClientDetailPage } from './pages/ClientDetailPage';
import { ClientsPage } from './pages/ClientsPage';
import { FirstAdminPage } from './pages/FirstAdminPage';
import { ForgotPasswordPage } from './pages/ForgotPasswordPage';
import { HomePage } from './pages/HomePage';
import { LoginPage } from './pages/LoginPage';
import { ProductsPage } from './pages/ProductsPage';
import { ProfilePage } from './pages/ProfilePage';
import { ResetPasswordPage } from './pages/ResetPasswordPage';
import type { ResetTokenCheck } from './routes/resetTokenCheck';
import { UsersPage } from './pages/UsersPage';
import { useAuthStore } from './store/authStore';

/**
 * Guardas de navegación. Son UX: la autorización real es `authMiddleware` del server (Block 4).
 * Los loaders llaman a la API con `navigateOnUnauthorized: false` porque redirigen ellos.
 */

/** `/`, `/perfil`, `/clientes`, `/clientes/:id` y `/productos`: exigen sesión, cualquier perfil. Sin sesión (401) o sin servidor, a `/login` (falla cerrado). */
async function sessionLoader() {
  try {
    const user = await getSession({ navigateOnUnauthorized: false });
    useAuthStore.getState().setUser(user);
    return null;
  } catch {
    useAuthStore.getState().setAnon();
    return redirect('/login');
  }
}

/**
 * `/usuarios`: exige sesión y perfil Admin (FEAT-006, FR-13). Sin sesión o sin servidor, a `/login`
 * (falla cerrado); con otro perfil, a `/`.
 */
async function usersLoader() {
  let user: PublicUser;
  try {
    user = await getSession({ navigateOnUnauthorized: false });
  } catch {
    useAuthStore.getState().setAnon();
    return redirect('/login');
  }
  useAuthStore.getState().setUser(user);
  return user.role === 'admin' ? null : redirect('/');
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

/**
 * `/recuperar/:token` (FEAT-008): valida el enlace una sola vez por navegación, acá y no en un efecto
 * (StrictMode duplica los efectos y cada chequeo cuenta para el límite del server). No pide sesión.
 * Un 429 es un bloqueo con el mensaje del server; otro 4xx, un enlace que no sirve; sin servidor, el
 * enlace no se puede usar y se informa como bloqueado con el texto de error de red.
 */
async function resetTokenLoader({ params }: LoaderFunctionArgs): Promise<ResetTokenCheck> {
  try {
    await checkResetToken(params.token ?? '');
    return { status: 'valid' };
  } catch (err) {
    if (err instanceof ApiError && err.status === 429) return { status: 'blocked', message: err.message };
    if (err instanceof ApiError) return { status: 'invalid', message: INVALID_RESET_LINK_MESSAGE };
    return { status: 'blocked', message: errorText(err) };
  }
}

export const routes: RouteObject[] = [
  { path: '/', loader: sessionLoader, Component: HomePage },
  { path: '/perfil', loader: sessionLoader, Component: ProfilePage },
  { path: '/usuarios', loader: usersLoader, Component: UsersPage },
  // Clientes y productos (FEAT-010): con sesión, para los tres perfiles; escribir lo autoriza el server.
  { path: '/clientes', loader: sessionLoader, Component: ClientsPage },
  { path: '/clientes/:id', loader: sessionLoader, Component: ClientDetailPage },
  { path: '/productos', loader: sessionLoader, Component: ProductsPage },
  { path: '/login', loader: loginLoader, Component: LoginPage },
  { path: '/setup', loader: setupLoader, Component: FirstAdminPage },
  { path: '/recuperar', Component: ForgotPasswordPage },
  // Solo se revalida si cambia el enlace: un segundo chequeo del mismo contaría para el límite sin
  // aportar nada; uno distinto sí hay que validarlo.
  {
    path: '/recuperar/:token',
    loader: resetTokenLoader,
    shouldRevalidate: ({ currentParams, nextParams }) => currentParams.token !== nextParams.token,
    Component: ResetPasswordPage,
  },
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
