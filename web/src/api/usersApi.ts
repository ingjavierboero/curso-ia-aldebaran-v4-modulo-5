import { NetworkError, request } from './client';
import type { CreateUserInput, PublicUser, UpdateUserInput } from './types';
import { USER_ROLES, USER_STATUSES } from './userRules';

/**
 * Gestión de usuarios (`/api/users`, solo Admin; la autorización real es la del server). Una
 * respuesta 2xx con una forma que no es la del contrato se trata como `NetworkError`: la UI no
 * muestra datos que no entiende.
 */
export async function listUsers(): Promise<PublicUser[]> {
  const data = await request<unknown>('/api/users');
  if (!isRecord(data) || !Array.isArray(data.users) || !data.users.every(isPublicUser)) throw new NetworkError();
  return data.users;
}

export async function createUser(input: CreateUserInput): Promise<PublicUser> {
  return userOf(
    await request<unknown>('/api/users', {
      method: 'POST',
      body: { name: input.name, email: input.email, role: input.role, password: input.password },
    }),
  );
}

export async function updateUser(id: string, input: UpdateUserInput): Promise<PublicUser> {
  return userOf(await request<unknown>(userPath(id), { method: 'PATCH', body: input }));
}

export async function deactivateUser(id: string): Promise<PublicUser> {
  return userOf(await request<unknown>(`${userPath(id)}/deactivate`, { method: 'POST', body: {} }));
}

export async function reactivateUser(id: string): Promise<PublicUser> {
  return userOf(await request<unknown>(`${userPath(id)}/reactivate`, { method: 'POST', body: {} }));
}

function userPath(id: string): string {
  return `/api/users/${encodeURIComponent(id)}`;
}

/** `{ user: PublicUser }` o `NetworkError`. */
function userOf(data: unknown): PublicUser {
  if (!isRecord(data) || !isPublicUser(data.user)) throw new NetworkError();
  return data.user;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPublicUser(value: unknown): value is PublicUser {
  if (!isRecord(value)) return false;
  const { id, name, email, role, status } = value;
  return (
    typeof id === 'string' &&
    typeof name === 'string' &&
    typeof email === 'string' &&
    isOneOf(USER_ROLES, role) &&
    isOneOf(USER_STATUSES, status)
  );
}

function isOneOf<T extends string>(values: readonly T[], value: unknown): value is T {
  return typeof value === 'string' && (values as readonly string[]).includes(value);
}
