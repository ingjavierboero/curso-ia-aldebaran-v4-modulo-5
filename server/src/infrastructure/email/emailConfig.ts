import type { Clock } from '../../domain/shared/Clock.js';
import { Email } from '../../domain/shared/Email.js';
import { InvalidEmail } from '../../domain/shared/errors.js';
// `Logger` vive en `http/authLog.ts`; moverlo a `logging/` queda como deuda (spec FEAT-004, Block 2).
import type { Logger } from '../http/authLog.js';

/**
 * Una variable de entorno de la configuración de emails tiene un valor inválido: el server no
 * arranca (`startup_failed`). El mensaje nombra la variable pero nunca su valor, que puede traer
 * credenciales (p. ej. `https://usuario:clave@host`).
 */
export class InvalidConfig extends Error {
  override readonly name = 'InvalidConfig';

  constructor(readonly variable: string) {
    super(`Configuración inválida: ${variable}`);
  }
}

export interface GmailCredentials {
  user: string;
  pass: string;
}

const DEFAULT_APP_URL = 'http://localhost:5173';
const APP_URL_MAX_LENGTH = 2048;
const ALLOWED_PROTOCOLS: ReadonlySet<string> = new Set(['http:', 'https:']);

/**
 * Dirección base de la web para los enlaces de los emails (FEAT-008, FR-03), leída solo de
 * `APP_URL`: ausente o vacía es `http://localhost:5173`; si no, una URL absoluta http/https sin
 * usuario ni contraseña, query ni fragment, de hasta 2048 caracteres. Devuelve `origin + pathname`
 * sin barra final. Cualquier otro valor lanza `InvalidConfig('APP_URL')`.
 */
export function resolveAppUrl(env: NodeJS.ProcessEnv = process.env): string {
  const raw = env.APP_URL?.trim() ?? '';
  if (raw === '') return DEFAULT_APP_URL;
  if (raw.length > APP_URL_MAX_LENGTH || raw.includes('?') || raw.includes('#')) {
    throw new InvalidConfig('APP_URL');
  }
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new InvalidConfig('APP_URL');
  }
  if (!ALLOWED_PROTOCOLS.has(url.protocol) || url.username !== '' || url.password !== '') {
    throw new InvalidConfig('APP_URL');
  }
  return `${url.origin}${url.pathname}`.replace(/\/+$/, '');
}

export interface ResolveAppUrlWithNoticeDeps {
  env?: NodeJS.ProcessEnv;
  logger: Logger;
  clock: Clock;
}

/**
 * `resolveAppUrl` para el arranque: si no hay `APP_URL` y se usa el valor por defecto, registra
 * `{ event: 'app_url_default', at }` para que un deploy sin la variable se note en el log. Con una
 * `APP_URL` configurada no registra nada; una inválida lanza `InvalidConfig` igual que `resolveAppUrl`.
 */
export function resolveAppUrlWithNotice({ env = process.env, logger, clock }: ResolveAppUrlWithNoticeDeps): string {
  const appUrl = resolveAppUrl(env);
  if ((env.APP_URL?.trim() ?? '') === '') {
    logger.info({ event: 'app_url_default', at: clock.now().toISOString() });
  }
  return appUrl;
}

/**
 * Dirección a la que se redirigen todos los emails en desarrollo (FEAT-008, FR-17), leída de
 * `EMAIL_REDIRECT_TO`: ausente o vacía es `null` (sin redirección); si no, el email normalizado por
 * `Email.create`. Uno inválido lanza `InvalidConfig('EMAIL_REDIRECT_TO')`.
 */
export function resolveEmailRedirect(env: NodeJS.ProcessEnv = process.env): string | null {
  const raw = env.EMAIL_REDIRECT_TO?.trim() ?? '';
  if (raw === '') return null;
  try {
    return Email.create(raw).value;
  } catch (err) {
    if (err instanceof InvalidEmail) throw new InvalidConfig('EMAIL_REDIRECT_TO');
    throw err;
  }
}

/**
 * Credenciales de la casilla del sistema, leídas solo del entorno (NFR-04): `GMAIL_USER` y
 * `GMAIL_APP_PASSWORD`. Si falta alguna (o está vacía) devuelve `null` y el server arranca sin SMTP.
 * El usuario se recorta; la contraseña se usa tal cual (las de aplicación pueden traer espacios).
 */
export function resolveGmailCredentials(env: NodeJS.ProcessEnv = process.env): GmailCredentials | null {
  const user = env.GMAIL_USER?.trim() ?? '';
  const pass = env.GMAIL_APP_PASSWORD ?? '';
  if (user === '' || pass.trim() === '') return null;
  return { user, pass };
}
