import { Alert } from 'antd';
import { useEffect, useState } from 'react';
import { getHealth } from '../api/healthApi';
import type { HealthResponse } from '../api/types';

/** Cada cuánto se vuelve a consultar el estado de salud (NFR-04). */
export const HEALTH_POLL_INTERVAL_MS = 60_000;

const DATABASE_NAME = 'Base de datos';

/**
 * Nombres de lo degradado. Un "degradado" sin detalle es la respuesta anónima con la base caída
 * (el server solo le retiene el detalle a un usuario con sesión cuando la base no responde).
 */
function degradedNames(health: HealthResponse): string[] {
  if (health.db === undefined && health.jobs === undefined) return [DATABASE_NAME];
  const names: string[] = [];
  if (health.db === 'no_disponible') names.push(DATABASE_NAME);
  for (const job of health.jobs ?? []) {
    if (job.late || job.lastOutcome === 'error') names.push(job.name);
  }
  return names;
}

/**
 * Banner de salud de la pantalla principal (FR-07). Consulta al montar y cada 60 s; un error de red
 * o una respuesta inválida conserva lo último mostrado. Los nombres se muestran como texto (React
 * los escapa), nunca como HTML.
 *
 * Solo se aplica la respuesta de la última consulta emitida: cada consulta nueva aborta la anterior
 * si sigue en vuelo, y desmontar aborta la que quede. Así una respuesta lenta nunca pisa a una más
 * nueva, y una respuesta tardía tras desmontar se descarta.
 */
export function HealthBanner() {
  const [names, setNames] = useState<string[] | null>(null);

  useEffect(() => {
    let inFlight: AbortController | null = null;
    function check() {
      inFlight?.abort();
      const controller = new AbortController();
      inFlight = controller;
      getHealth(controller.signal).then(
        (health) => {
          if (controller.signal.aborted) return;
          setNames(health.status === 'degradado' ? degradedNames(health) : null);
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
