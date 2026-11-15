import { NetworkError } from './authApi';
import type { HealthJob, HealthResponse } from './types';

/**
 * Consulta `GET /api/health`. No pasa por el `request` común: 503 es una respuesta válida (estado
 * "degradado") y un 401 acá no es una sesión perdida que haya que manejar navegando.
 * 200 y 503 con un body de forma válida se devuelven; cualquier otra cosa es `NetworkError`.
 * Con `signal` abortado la consulta se cancela y la promesa rechaza, aunque la respuesta ya
 * hubiera llegado: una respuesta de una consulta abortada nunca se devuelve.
 */
export async function getHealth(signal?: AbortSignal): Promise<HealthResponse> {
  let response: Response;
  try {
    response = await fetch('/api/health', {
      method: 'GET',
      headers: { Accept: 'application/json' },
      credentials: 'include',
      ...(signal ? { signal } : {}),
    });
  } catch {
    throw new NetworkError();
  }

  if (response.status !== 200 && response.status !== 503) throw new NetworkError();

  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw new NetworkError();
  }
  if (signal?.aborted || !isHealthResponse(data)) throw new NetworkError();
  return data;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isHealthJob(value: unknown): value is HealthJob {
  if (!isRecord(value)) return false;
  const { name, lastRunAt, lastOutcome, late, readFailed } = value;
  return (
    typeof name === 'string' &&
    (lastRunAt === null || typeof lastRunAt === 'string') &&
    (lastOutcome === null || lastOutcome === 'ok' || lastOutcome === 'error') &&
    typeof late === 'boolean' &&
    typeof readFailed === 'boolean'
  );
}

function isHealthResponse(value: unknown): value is HealthResponse {
  if (!isRecord(value)) return false;
  const { status, db, jobs } = value;
  if (status !== 'ok' && status !== 'degradado') return false;
  if (db !== undefined && db !== 'disponible' && db !== 'no_disponible') return false;
  if (jobs !== undefined && !(Array.isArray(jobs) && jobs.every(isHealthJob))) return false;
  return true;
}
