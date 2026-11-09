import { useAuthStore } from '../store/authStore';
import type { PublicUser } from './types';

export interface LoginInput {
  email: string;
  password: string;
}

export interface FirstAdminInput {
  name: string;
  email: string;
  password: string;
}

export const NETWORK_ERROR_MESSAGE = 'No se pudo conectar con el servidor';

/** Respuesta 4xx del server, con su `{ error }` (o un texto genérico si no vino). */
export class ApiError extends Error {
  override readonly name = 'ApiError';

  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Fallo de red o 5xx: para la UI es lo mismo, el servidor no respondió como se esperaba. */
export class NetworkError extends Error {
  override readonly name = 'NetworkError';

  constructor() {
    super(NETWORK_ERROR_MESSAGE);
  }
}

let unauthorizedHandler: (() => void) | null = null;

/** El router registra acá cómo ir a `/login` ante un 401 fuera del login (sesión vencida o cerrada). */
export function setUnauthorizedHandler(handler: (() => void) | null): void {
  unauthorizedHandler = handler;
}

interface RequestOptions {
  method?: 'GET' | 'POST';
  body?: unknown;
  /** `false` en `login`: su 401 es "credenciales inválidas", no una sesión perdida. */
  handleUnauthorized?: boolean;
  /** `false` en los loaders: ellos redirigen con `redirect()` y no hay que navegar dos veces. */
  navigateOnUnauthorized?: boolean;
}

/**
 * Único punto de salida a la API. La cookie `aldebaran_sid` la manda el navegador
 * (`credentials: 'include'`): la web nunca lee ni guarda el token.
 */
async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, handleUnauthorized = true, navigateOnUnauthorized = true } = options;
  const headers: Record<string, string> = { Accept: 'application/json' };
  // Todo POST lleva JSON, incluso el logout (`{}`): el server responde 415 si falta (R-07).
  if (method === 'POST') headers['Content-Type'] = 'application/json';

  let response: Response;
  try {
    response = await fetch(path, {
      method,
      headers,
      credentials: 'include',
      ...(method === 'POST' ? { body: JSON.stringify(body ?? {}) } : {}),
    });
  } catch {
    throw new NetworkError();
  }

  if (response.status >= 500) throw new NetworkError();

  if (response.status === 401 && handleUnauthorized) {
    useAuthStore.getState().setAnon();
    if (navigateOnUnauthorized) unauthorizedHandler?.();
  }

  if (!response.ok) throw new ApiError(response.status, await errorMessage(response));
  if (response.status === 204) return undefined as T;
  try {
    return (await response.json()) as T;
  } catch {
    throw new NetworkError();
  }
}

async function errorMessage(response: Response): Promise<string> {
  try {
    const data: unknown = await response.json();
    if (typeof data === 'object' && data !== null && typeof (data as { error?: unknown }).error === 'string') {
      return (data as { error: string }).error;
    }
  } catch {
    // Body vacío o que no es JSON: se usa el texto genérico.
  }
  return `Error ${response.status}`;
}

export async function login(input: LoginInput): Promise<PublicUser> {
  const { user } = await request<{ user: PublicUser }>('/api/auth/login', {
    method: 'POST',
    body: { email: input.email, password: input.password },
    handleUnauthorized: false,
  });
  return user;
}

export async function logout(): Promise<void> {
  await request<void>('/api/auth/logout', { method: 'POST', body: {} });
}

export async function getSession(options: { navigateOnUnauthorized?: boolean } = {}): Promise<PublicUser> {
  const { user } = await request<{ user: PublicUser }>('/api/auth/session', options);
  return user;
}

export async function getSetupStatus(): Promise<{ needsFirstAdmin: boolean }> {
  const { needsFirstAdmin } = await request<{ needsFirstAdmin: boolean }>('/api/setup/status');
  return { needsFirstAdmin };
}

export async function registerFirstAdmin(input: FirstAdminInput): Promise<PublicUser> {
  const { user } = await request<{ user: PublicUser }>('/api/setup/first-admin', {
    method: 'POST',
    body: { name: input.name, email: input.email, password: input.password },
  });
  return user;
}

/** Texto para mostrar en pantalla ante cualquier error de una llamada. */
export function errorText(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  return NETWORK_ERROR_MESSAGE;
}
