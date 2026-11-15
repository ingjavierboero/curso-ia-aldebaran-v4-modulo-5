import type { UserRole, UserStatus } from './types';

/**
 * Valores y límites de un usuario, los mismos que valida el server (FEAT-001 NFR-03, FEAT-006).
 * Viven fuera de los componentes: un módulo de componentes que exporta constantes rompe el Fast Refresh.
 */

/** Los perfiles, en el orden en que se ofrecen (FR-02). */
export const USER_ROLES: readonly UserRole[] = ['admin', 'editor', 'consulta'];

export const USER_STATUSES: readonly UserStatus[] = ['activo', 'inactivo'];

export const USER_NAME_MAX_LENGTH = 100;
export const USER_EMAIL_MAX_LENGTH = 254;
export const USER_PASSWORD_MIN_LENGTH = 8;
