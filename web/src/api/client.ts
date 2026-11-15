import { useAuthStore } from '../store/authStore';

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

/**
 * Fallo de red, 5xx o respuesta con forma inválida: para la UI es lo mismo, el servidor no respondió
 * como se esperaba. `status` distingue los casos para quien lo necesite: el status del 5xx, o `null`
 * si no hubo respuesta (fetch rechazado) o su body no se pudo leer o no tenía la forma esperada.
 */
export class NetworkError extends Error {
  override readonly name = 'NetworkError';

  constructor(readonly status: number | null = null) {
    super(NETWORK_ERROR_MESSAGE);
  }
}

let unauthorizedHandler: (() => void) | null = null;

/** El router registra acá cómo ir a `/login` ante un 401 fuera del login (sesión vencida o cerrada). */
export function setUnauthorizedHandler(handler: (() => void) | null): void {
  unauthorizedHandler = handler;
}

export type HttpMethod = 'GET' | 'POST' | 'PATCH';

export interface RequestOptions {
  method?: HttpMethod;
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
export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, handleUnauthorized = true, navigateOnUnauthorized = true } = options;
  const sendsJson = method !== 'GET';
  const headers: Record<string, string> = { Accept: 'application/json' };
  // Toda escritura lleva JSON, incluso el logout o una baja (`{}`): el server responde 415 si falta (R-07).
  if (sendsJson) headers['Content-Type'] = 'application/json';

  let response: Response;
  try {
    response = await fetch(path, {
      method,
      headers,
      credentials: 'include',
      ...(sendsJson ? { body: JSON.stringify(body ?? {}) } : {}),
    });
  } catch {
    throw new NetworkError();
  }

  if (response.status >= 500) throw new NetworkError(response.status);

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

/** Texto para mostrar en pantalla ante cualquier error de una llamada. */
export function errorText(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  return NETWORK_ERROR_MESSAGE;
}
