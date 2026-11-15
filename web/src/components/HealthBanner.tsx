import { Alert } from 'antd';
import { useEffect, useState } from 'react';
import { ApiError, NetworkError, getSession } from '../api/authApi';
import { getHealth } from '../api/healthApi';
import type { HealthResponse } from '../api/types';

/** Cada cuánto se vuelve a consultar el estado de salud (NFR-04). */
export const HEALTH_POLL_INTERVAL_MS = 60_000;

const DATABASE_NAME = 'Base de datos';

/** Un "degradado" sin `db` ni `jobs`: o la base está caída, o la sesión ya no es válida. */
function lacksDetail(health: HealthResponse): boolean {
  return health.db === undefined && health.jobs === undefined;
}

/** Nombres de lo degradado según el detalle: la base caída y los procesos atrasados, con error o con lectura fallida. */
function degradedNames(health: HealthResponse): string[] {
  const names: string[] = [];
  if (health.db === 'no_disponible') names.push(DATABASE_NAME);
  for (const job of health.jobs ?? []) {
    if (job.late || job.lastOutcome === 'error' || job.readFailed) names.push(job.name);
  }
  return names;
}

/**
 * Banner de salud de la pantalla principal (FR-07 de FEAT-003). Consulta al montar y cada 60 s; un
 * error de red o una respuesta inválida conserva lo último mostrado. Los nombres se muestran como
 * texto (React los escapa), nunca como HTML.
 *
 * Un "degradado" sin detalle llega igual con la base caída que sin sesión válida, así que antes de
 * mostrar nada se confirma la sesión, una vez por consulta (FEAT-004, FR-01 a FR-04):
 * - sesión válida, o un error del servidor al confirmarla → nombra "Base de datos";
 * - 401 → sin banner; el camino común de `authApi` ya lleva al login;
 * - sin respuesta (error de red) → se conserva lo último mostrado.
 * Con "ok" o con detalle no se confirma nada (NFR-01).
 *
 * Solo se aplica la respuesta de la última consulta emitida: cada consulta nueva aborta la anterior
 * si sigue en vuelo, y desmontar aborta la que quede. Así una respuesta lenta nunca pisa a una más
 * nueva, y una respuesta tardía tras desmontar se descarta. La confirmación de sesión no se cancela
 * (la navegación ante un 401 ocurre en `authApi`), pero su resultado se descarta igual si la
 * consulta que la originó quedó abortada.
 */
export function HealthBanner() {
  const [names, setNames] = useState<string[] | null>(null);

  useEffect(() => {
    let inFlight: AbortController | null = null;

    function confirmSession(controller: AbortController) {
      getSession().then(
        () => {
          if (controller.signal.aborted) return;
          setNames([DATABASE_NAME]);
        },
        (err: unknown) => {
          if (controller.signal.aborted) return;
          if (err instanceof ApiError && err.status === 401) setNames(null);
          else if (err instanceof NetworkError && err.status !== null) setNames([DATABASE_NAME]);
          // Sin respuesta u otro error: se conserva lo último mostrado.
        },
      );
    }

    function check() {
      inFlight?.abort();
      const controller = new AbortController();
      inFlight = controller;
      getHealth(controller.signal).then(
        (health) => {
          if (controller.signal.aborted) return;
          if (health.status !== 'degradado') setNames(null);
          else if (lacksDetail(health)) confirmSession(controller);
          else setNames(degradedNames(health));
        },
        () => {},
      );
    }
    check();
    const id = setInterval(check, HEALTH_POLL_INTERVAL_MS);
    return () => {
      clearInterval(id);
      inFlight?.abort();
    };
  }, []);

  if (names === null) return null;
  return (
    <Alert
      type="warning"
      showIcon
      title="El sistema funciona con problemas"
      description={names.length > 0 ? `Con problemas: ${names.join(', ')}` : undefined}
    />
  );
}
