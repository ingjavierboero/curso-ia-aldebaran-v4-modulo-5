import { vi } from 'vitest';

/** Respuesta simulada: status + body JSON, o un fallo de red (fetch rechazado). */
export type Reply = { status: number; body?: unknown } | 'network-error';

/** Respuesta que el test resuelve cuando quiere (para observar la UI mientras la llamada está en curso). */
export type DeferredReply = () => Promise<Reply>;

/** Una respuesta fija, o una secuencia: cada llamada consume la siguiente y la última se repite. */
export type RouteReply = Reply | DeferredReply | (Reply | DeferredReply)[];

export interface FetchCall {
  method: string;
  path: string;
  init: RequestInit | undefined;
  body: unknown;
}

export interface FetchMock {
  calls: FetchCall[];
  callsTo: (method: string, path: string) => FetchCall[];
  unmatched: string[];
}

/** Dobles creados en el test en curso; `setup.ts` exige que ninguno haya recibido rutas no declaradas. */
const activeMocks: FetchMock[] = [];

/**
 * Reemplaza `fetch` global por un doble con rutas `"MÉTODO /path"`. Nunca hay red real. Una ruta
 * no declarada responde 500 y queda en `unmatched`; el `afterEach` común hace fallar el test.
 */
export function mockFetch(routes: Record<string, RouteReply>): FetchMock {
  const pending = new Map<string, (Reply | DeferredReply)[]>();
  for (const [key, reply] of Object.entries(routes)) pending.set(key, Array.isArray(reply) ? [...reply] : [reply]);

  const mock: FetchMock = {
    calls: [],
    unmatched: [],
    callsTo: (method, path) => mock.calls.filter((c) => c.method === method && c.path === path),
  };
  activeMocks.push(mock);

  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const path = new URL(url, 'http://localhost').pathname;
    const method = (init?.method ?? 'GET').toUpperCase();
    const body = typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined;
    mock.calls.push({ method, path, init, body });

    const key = `${method} ${path}`;
    const queue = pending.get(key);
    if (queue === undefined || queue.length === 0) {
      mock.unmatched.push(key);
      return jsonResponse(500, { error: `ruta no simulada: ${key}` });
    }
    const next = (queue.length > 1 ? queue.shift() : queue[0]) as Reply | DeferredReply;
    const reply = typeof next === 'function' ? await next() : next;
    if (reply === 'network-error') throw new TypeError('Failed to fetch');
    return jsonResponse(reply.status, reply.body);
  });

  vi.stubGlobal('fetch', fn);
  return mock;
}

/** Rutas no declaradas que recibieron los dobles del test; vacía la lista para el siguiente. */
export function takeUnmatchedFetches(): string[] {
  const unmatched = activeMocks.flatMap((m) => m.unmatched);
  activeMocks.length = 0;
  return unmatched;
}

/** Una respuesta que queda pendiente hasta que el test llama a `resolve`. */
export function deferred(): { reply: DeferredReply; resolve: (reply: Reply) => void } {
  let resolve: (reply: Reply) => void = () => {};
  const promise = new Promise<Reply>((r) => {
    resolve = r;
  });
  return { reply: () => promise, resolve: (reply) => resolve(reply) };
}

function jsonResponse(status: number, body: unknown): Response {
  if (status === 204 || body === undefined) return new Response(null, { status });
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

export const ANA = {
  id: 'u-1',
  name: 'Ana Admin',
  email: 'ana@aldebaran.test',
  role: 'admin',
  status: 'activo',
} as const;

export const SESSION_401 = { status: 401, body: { error: 'Sesión no válida' } } as const;
