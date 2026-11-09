/**
 * Aviso que una pantalla deja al navegar a `/login` por `location.state` (por ejemplo, el registro
 * del primer Admin). Vive fuera de `pages/` para que ninguna página importe otra.
 */
export interface LoginNotice {
  type: 'success' | 'warning';
  text: string;
}

/** `state` listo para `navigate('/login', { state })`. */
export function loginNoticeState(notice: LoginNotice): { notice: LoginNotice } {
  return { notice };
}

/** Lee el aviso de `location.state`; cualquier otra forma se ignora. */
export function readLoginNotice(state: unknown): LoginNotice | null {
  if (typeof state !== 'object' || state === null) return null;
  const notice = (state as { notice?: unknown }).notice;
  if (typeof notice !== 'object' || notice === null) return null;
  const { type, text } = notice as { type?: unknown; text?: unknown };
  if ((type === 'success' || type === 'warning') && typeof text === 'string') return { type, text };
  return null;
}
