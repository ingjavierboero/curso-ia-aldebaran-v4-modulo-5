import type { Request, RequestHandler } from 'express';
import rateLimit, { type IncrementResponse, ipKeyGenerator, type RateLimitInfo, type Store } from 'express-rate-limit';
import { retryAfterMinutes, WINDOW_MS } from '../../../domain/auth/AttemptWindow.js';
import type { Clock } from '../../../domain/shared/Clock.js';
import { type AuthEvent, type Logger, logAuthAttempt } from '../authLog.js';
import { bodyObject } from '../body.js';
import type { AttemptTracker } from './AttemptTracker.js';

/** Propiedad del request donde express-rate-limit deja la info del límite (su `RateLimitInfo`). */
const REQUEST_PROPERTY = 'rateLimit';

type RateLimitedRequest = Request & { [REQUEST_PROPERTY]?: RateLimitInfo };

/**
 * Clave del límite de intentos: la IP que arma el server (`req.ip`, sin `trust proxy`, S-03),
 * normalizada por `ipKeyGenerator` (IPv4 tal cual, IPv6 agrupado por subred /56). Una IP ausente
 * se trata como `''`: todas comparten esa clave y el límite sigue aplicando (falla cerrado).
 */
export function attemptKey(req: Request): string {
  return ipKeyGenerator(req.ip ?? '');
}

/** El `email` del body si el body es un objeto y el campo es string; si no, `''`. Nunca lanza. */
export function bodyEmailOf(req: Request): string {
  let body: Record<string, unknown>;
  try {
    body = bodyObject(req.body);
  } catch {
    return '';
  }
  const email = body['email'];
  return typeof email === 'string' ? email : '';
}

/**
 * Store de express-rate-limit que no cuenta: solo consulta al registro si la clave está bloqueada
 * (ADR-006). Con `limit: 1`, `totalHits` 2 hace que la librería corte el pedido y 1 lo deja pasar.
 * Los fallos los informa la ruta al registro cuando conoce el resultado.
 */
export class TrackerStore implements Store {
  /** El registro vive en este proceso: un bloqueo en una instancia no afecta a otra. */
  readonly localKeys = true;

  constructor(private readonly tracker: AttemptTracker) {}

  increment(key: string): IncrementResponse {
    const { blocked, blockedUntil } = this.tracker.check(key);
    return { totalHits: blocked ? 2 : 1, resetTime: blockedUntil ?? undefined };
  }

  /** No hay nada que descontar: este Store nunca suma. */
  decrement(_key: string): void {}

  resetKey(key: string): void {
    this.tracker.succeed(key);
  }
}

export interface AttemptGateOptions {
  operation: AuthEvent;
  tracker: AttemptTracker;
  clock: Clock;
  logger: Logger;
  /** El email que se registra con el bloqueo. Si lanzara, se registra como inválido (`null`). */
  emailOf: (req: Request) => string;
}

/**
 * Compuerta del límite de intentos de una operación (FEAT-009, ADR-006): el middleware de
 * express-rate-limit, que rechaza con 429 a una IP bloqueada antes del handler de la ruta, así que
 * el caso de uso (y argon2) no corre. Responde `Retry-After` en segundos, calculado con el `Clock`
 * inyectado, y registra el intento como `blocked` (sin contraseñas).
 */
export function createAttemptGate({ operation, tracker, clock, logger, emailOf }: AttemptGateOptions): RequestHandler {
  const safeEmailOf = (req: Request): string => {
    try {
      return emailOf(req);
    } catch {
      return '';
    }
  };

  return rateLimit({
    windowMs: WINDOW_MS,
    limit: 1,
    keyGenerator: attemptKey,
    standardHeaders: false,
    legacyHeaders: false,
    store: new TrackerStore(tracker),
    requestPropertyName: REQUEST_PROPERTY,
    handler: (req, res) => {
      // El fin del bloqueo es el `resetTime` que devolvió `TrackerStore.increment` en este mismo
      // pedido; el `Clock` inyectado solo da el `now`.
      const now = clock.now().getTime();
      const blockedUntil = (req as RateLimitedRequest)[REQUEST_PROPERTY]?.resetTime;
      const remainingMs = Math.max(0, (blockedUntil?.getTime() ?? now) - now);
      res.set('Retry-After', String(Math.max(1, Math.ceil(remainingMs / 1000))));
      logAuthAttempt(logger, clock, req, operation, 'blocked', safeEmailOf(req));
      res.status(429).json({ error: `Demasiados intentos. Probá de nuevo en ${retryAfterMinutes(remainingMs)} minutos.` });
    },
  });
}
