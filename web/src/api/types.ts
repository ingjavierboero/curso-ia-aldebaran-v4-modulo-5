/** Perfil de un usuario (FEAT-006): define lo que puede hacer. */
export type UserRole = 'admin' | 'editor' | 'consulta';

/** Estado de un usuario: un Inactivo no inicia sesión. */
export type UserStatus = 'activo' | 'inactivo';

/** Lo único que el server devuelve de un usuario (FR-08). Lo comparten `api/` y `store/`. */
export interface PublicUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  status: UserStatus;
}

/** Body de `POST /api/users`: el usuario queda Activo. */
export interface CreateUserInput {
  name: string;
  email: string;
  role: UserRole;
  password: string;
}

/** Body de `PATCH /api/users/:id`: al menos uno de los campos. */
export interface UpdateUserInput {
  name?: string;
  email?: string;
  role?: UserRole;
}

/** Estado de un proceso automático, tal como lo informa `GET /api/health` a un usuario con sesión. */
export interface HealthJob {
  name: string;
  lastRunAt: string | null;
  lastOutcome: 'ok' | 'error' | null;
  late: boolean;
  /** No se pudieron leer sus corridas: está degradado aunque la base responda. */
  readFailed: boolean;
}

/**
 * Respuesta de `GET /api/health` (200 u 503). Sin sesión válida, o con la base caída, llega solo
 * `status`; con sesión llegan además `db` y `jobs`.
 */
export interface HealthResponse {
  status: 'ok' | 'degradado';
  db?: 'disponible' | 'no_disponible';
  jobs?: HealthJob[];
}
