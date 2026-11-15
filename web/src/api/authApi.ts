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
