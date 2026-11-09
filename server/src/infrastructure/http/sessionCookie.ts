import type { CookieOptions, Request, Response } from 'express';

/** Nombre de la cookie de sesión (ADR-001). */
export const SESSION_COOKIE = 'aldebaran_sid';

/** Únicos `NODE_ENV` en que la cookie va sin `Secure` (HTTP local y tests). */
const INSECURE_COOKIE_ENVS: ReadonlySet<string> = new Set(['development', 'test']);

/**
 * `true` si la cookie debe llevar `Secure`. Falla cerrado: es `Secure` salvo que `NODE_ENV` sea
 * `development` o `test`, así un deploy sin la variable no emite la cookie sin `Secure`.
 */
export function defaultSecureCookie(env: NodeJS.ProcessEnv = process.env): boolean {
  return !INSECURE_COOKIE_ENVS.has(env.NODE_ENV ?? '');
}

/** httpOnly + SameSite=Strict + Path=/, sin Max-Age ni Expires (cookie de sesión del navegador). */
function cookieOptions(secure: boolean): CookieOptions {
  return { httpOnly: true, sameSite: 'strict', secure, path: '/' };
}

export function setSessionCookie(res: Response, token: string, secure: boolean): void {
  res.cookie(SESSION_COOKIE, token, cookieOptions(secure));
}

export function clearSessionCookie(res: Response, secure: boolean): void {
  res.clearCookie(SESSION_COOKIE, cookieOptions(secure));
}

/** El token de la cookie, o `null` si falta o no es un string no vacío. */
export function readSessionToken(req: Request): string | null {
  const value: unknown = (req.cookies as Record<string, unknown> | undefined)?.[SESSION_COOKIE];
  return typeof value === 'string' && value.length > 0 ? value : null;
}
