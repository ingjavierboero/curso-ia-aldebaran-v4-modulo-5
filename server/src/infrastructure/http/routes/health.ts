import { Router, type NextFunction, type Request, type Response } from 'express';
import type { PeekSession } from '../../../application/auth/PeekSession.js';
import type { GetHealth } from '../../../application/health/GetHealth.js';
import type { HealthReport } from '../../../domain/health/HealthEvaluation.js';
import type { Clock } from '../../../domain/shared/Clock.js';
import type { Logger } from '../authLog.js';
import { readSessionToken } from '../sessionCookie.js';

export interface HealthRoutesDeps {
  getHealth: Pick<GetHealth, 'execute'>;
  peekSession: Pick<PeekSession, 'execute'>;
  logger: Logger;
  clock: Clock;
}

/** La única ruta que atiende el handler, comparada exacta (igual que en `PUBLIC_ROUTES`). */
const HEALTH_PATH = '/api/health';

/**
 * `GET /health` (y `HEAD`, que Express atiende con el mismo handler y sin body): pública (FR-01).
 * 200 con "ok", 503 con "degradado" (NFR-03). Sin una sesión válida el body es exactamente
 * `{ status }` (NFR-02, R-02); con sesión suma la base y el detalle de cada proceso (FR-02).
 *
 * La sesión se verifica con `PeekSession` (sin renovarla), y solo si el reporte dice
 * `db: "disponible"`; con la base no disponible la respuesta es siempre la anónima, haya o no cookie
 * (AC-14). Nunca usa `req.user`, nunca lanza `Unauthenticated`, no emite `Set-Cookie` ni loguea
 * `session_rejected` (R-01, R-05). Si validar la sesión falla, la respuesta es la anónima (nunca un
 * 500) y se loguea `health_session_check_failed` sin detalle.
 *
 * Solo la ruta exacta llega al handler: una variante (barra final, mayúsculas, también en `/api`)
 * pasa por el middleware como cualquier ruta privada, que renovaría la sesión (R-06), y termina en 404.
 */
export function healthRoutes(deps: HealthRoutesDeps): Router {
  const router = Router({ strict: true, caseSensitive: true });

  router.get('/health', (req: Request, res: Response, next: NextFunction) => {
    // El montaje en `/api` no distingue mayúsculas: `/API/health` llegaría acá.
    if (`${req.baseUrl}${req.path}` !== HEALTH_PATH) {
      next();
      return;
    }
    const report = deps.getHealth.execute();
    const code = report.status === 'ok' ? 200 : 503;

    // Las sesiones viven en la misma base: con la base no disponible no se valida la sesión (esperaría
    // el timeout de la conexión compartida y congelaría el event loop) y la respuesta es la anónima.
    if (report.db !== 'disponible' || !hasValidSession(deps, req)) {
      res.status(code).json({ status: report.status });
      return;
    }
    res.status(code).json(detailOf(report));
  });

  return router;
}

function hasValidSession(deps: HealthRoutesDeps, req: Request): boolean {
  const token = readSessionToken(req);
  if (token === null) return false;
  try {
    return deps.peekSession.execute(token) !== null;
  } catch {
    // Sin el texto del error, el token ni la IP: solo que la validación falló.
    deps.logger.error({ event: 'health_session_check_failed', at: deps.clock.now().toISOString() });
    return false;
  }
}

function detailOf(report: HealthReport) {
  return {
    status: report.status,
    db: report.db,
    jobs: report.jobs.map((job) => ({
      name: job.name,
      lastRunAt: job.lastRunAt === null ? null : job.lastRunAt.toISOString(),
      lastOutcome: job.lastOutcome,
      late: job.late,
      readFailed: job.readFailed,
    })),
  };
}
