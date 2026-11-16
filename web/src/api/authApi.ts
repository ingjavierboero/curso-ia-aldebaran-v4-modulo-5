import { request } from './client';
import type { PublicUser } from './types';

// Lo que vivía acá y ahora comparte toda la API web (`client.ts`); se reexporta para sus llamadores.
export { ApiError, NETWORK_ERROR_MESSAGE, NetworkError, errorText, setUnauthorizedHandler } from './client';

export interface LoginInput {
  email: string;
  password: string;
}

export interface FirstAdminInput {
  name: string;
  email: string;
  password: string;
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

export interface ChangePasswordInput {
  currentPassword: string;
  newPassword: string;
}

/** Cambia la contraseña del usuario de la sesión (FEAT-007): `204` sin body. Un 400 trae el motivo. */
export async function changePassword(input: ChangePasswordInput): Promise<void> {
  await request<void>('/api/auth/password', {
    method: 'POST',
    body: { currentPassword: input.currentPassword, newPassword: input.newPassword },
  });
}

/*
 * Recuperación de contraseña (FEAT-008). Son rutas públicas: un 401 no significa una sesión perdida,
 * así que no toca el store ni navega al login (`handleUnauthorized: false`).
 */

/**
 * El texto del server para un enlace inexistente, vencido, usado o anulado (`InvalidResetToken`).
 * TIENE que coincidir con el mensaje por defecto de `InvalidResetToken` en
 * `server/src/application/auth/errors.ts`: la web distingue ese 400 de los demás (contraseña débil,
 * body inválido) por el texto, porque la API no devuelve un código de error estable (deuda registrada).
 */
export const INVALID_RESET_LINK_MESSAGE = 'El enlace no es válido o venció';

/** Pide el enlace: el server responde siempre el mismo `{ message }`, exista o no el email. */
export async function requestPasswordReset(email: string): Promise<{ message: string }> {
  const { message } = await request<{ message: string }>('/api/auth/password-reset', {
    method: 'POST',
    body: { email },
    handleUnauthorized: false,
  });
  return { message };
}

/** Valida el enlace sin usarlo: `204`, o `ApiError` 400 (inválido o vencido) / 429 (bloqueado). */
export async function checkResetToken(token: string): Promise<void> {
  await request<void>('/api/auth/password-reset/check', {
    method: 'POST',
    body: { token },
    handleUnauthorized: false,
  });
}

/** Define la nueva contraseña con el enlace: `204`; un 400 o 429 trae el motivo. */
export async function confirmPasswordReset(token: string, newPassword: string): Promise<void> {
  await request<void>('/api/auth/password-reset/confirm', {
    method: 'POST',
    body: { token, newPassword },
    handleUnauthorized: false,
  });
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
