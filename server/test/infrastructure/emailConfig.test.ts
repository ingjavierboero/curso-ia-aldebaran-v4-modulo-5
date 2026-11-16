import { describe, expect, it } from 'vitest';
import {
  InvalidConfig,
  resolveAppUrl,
  resolveAppUrlWithNotice,
  resolveEmailRedirect,
  resolveGmailCredentials,
} from '../../src/infrastructure/email/emailConfig.js';
import type { Logger, LogRecord } from '../../src/infrastructure/http/authLog.js';
import { FakeClock } from '../support/FakeClock.js';

/** Ejecuta `fn`, exige que lance y devuelve lo lanzado (sin try/catch que pase sin afirmar). */
function thrownBy(fn: () => unknown): unknown {
  let thrown: unknown = undefined;
  expect(() => {
    try {
      fn();
    } catch (err) {
      thrown = err;
      throw err;
    }
  }).toThrow();
  return thrown;
}

function recordingLogger(): { logger: Logger; records: LogRecord[] } {
  const records: LogRecord[] = [];
  return {
    records,
    logger: {
      info: (record) => records.push({ level: 'info', ...record }),
      error: (record) => records.push({ level: 'error', ...record }),
    },
  };
}

describe('resolveAppUrl', () => {
  // AC-02: sin APP_URL (o vacía) la web local de Vite
  it('test_app_url_por_defecto_localhost', () => {
    expect(resolveAppUrl({})).toBe('http://localhost:5173');
    expect(resolveAppUrl({ APP_URL: '' })).toBe('http://localhost:5173');
    expect(resolveAppUrl({ APP_URL: '   ' })).toBe('http://localhost:5173');
  });

  // AC-02: la dirección configurada, sin barra final
  it('test_app_url_configurada_sin_barra_final', () => {
    expect(resolveAppUrl({ APP_URL: 'https://aldebaran.empresa.com/' })).toBe('https://aldebaran.empresa.com');
    expect(resolveAppUrl({ APP_URL: 'https://aldebaran.empresa.com' })).toBe('https://aldebaran.empresa.com');
    expect(resolveAppUrl({ APP_URL: 'https://x//' })).toBe('https://x');
    expect(resolveAppUrl({ APP_URL: 'http://intranet:8080/aldebaran/' })).toBe('http://intranet:8080/aldebaran');
    // límite de largo: 2048 caracteres se aceptan
    const at2048 = `https://x.com/${'a'.repeat(2048 - 'https://x.com/'.length)}`;
    expect(at2048).toHaveLength(2048);
    expect(resolveAppUrl({ APP_URL: at2048 })).toBe(at2048);
  });

  // sad path: protocolo, credenciales, query, fragment, no-URL o demasiado larga
  it('test_app_url_invalida_rechazada', () => {
    const at2049 = `https://x.com/${'a'.repeat(2049 - 'https://x.com/'.length)}`;
    expect(at2049).toHaveLength(2049);
    const invalid = [
      'ftp://x',
      'https://u:p@x',
      'https://x/?a=1',
      'https://x/?',
      'https://x/#frag',
      'https://x/#',
      'no-url',
      at2049,
    ];
    for (const raw of invalid) {
      const err = thrownBy(() => resolveAppUrl({ APP_URL: raw }));
      expect(err, raw).toBeInstanceOf(InvalidConfig);
      expect((err as InvalidConfig).variable, raw).toBe('APP_URL');
    }
    // el valor (que puede traer credenciales) nunca va en el mensaje
    const withCredentials = thrownBy(() => resolveAppUrl({ APP_URL: 'https://u:secreto@x' }));
    expect(withCredentials).toBeInstanceOf(InvalidConfig);
    expect((withCredentials as Error).message).not.toContain('secreto');
  });
});

describe('resolveAppUrlWithNotice', () => {
  it('sin APP_URL usa el valor por defecto y registra app_url_default (solo event y at)', () => {
    const { logger, records } = recordingLogger();
    const clock = new FakeClock('2026-11-16T14:00:00.000Z');

    expect(resolveAppUrlWithNotice({ env: {}, logger, clock })).toBe('http://localhost:5173');
    expect(records).toEqual([{ level: 'info', event: 'app_url_default', at: '2026-11-16T14:00:00.000Z' }]);
  });

  it('con APP_URL configurada no registra nada; inválida lanza InvalidConfig', () => {
    const { logger, records } = recordingLogger();
    const clock = new FakeClock();

    expect(resolveAppUrlWithNotice({ env: { APP_URL: 'https://aldebaran.empresa.com/' }, logger, clock })).toBe(
      'https://aldebaran.empresa.com',
    );
    const err = thrownBy(() => resolveAppUrlWithNotice({ env: { APP_URL: 'ftp://x' }, logger, clock }));
    expect(err).toBeInstanceOf(InvalidConfig);
    expect(records).toEqual([]);
  });
});

describe('resolveEmailRedirect', () => {
  // sad path: un valor que no es email corta el arranque
  it('test_email_redirect_invalido_rechazado', () => {
    const err = thrownBy(() => resolveEmailRedirect({ EMAIL_REDIRECT_TO: 'no-es-email' }));
    expect(err).toBeInstanceOf(InvalidConfig);
    expect((err as InvalidConfig).variable).toBe('EMAIL_REDIRECT_TO');
    // vacía o ausente → sin redirección; válida → normalizada
    expect(resolveEmailRedirect({})).toBeNull();
    expect(resolveEmailRedirect({ EMAIL_REDIRECT_TO: '' })).toBeNull();
    expect(resolveEmailRedirect({ EMAIL_REDIRECT_TO: ' Dev@Empresa.com ' })).toBe('dev@empresa.com');
  });
});

describe('resolveGmailCredentials', () => {
  it('devuelve las dos credenciales cuando están presentes', () => {
    expect(resolveGmailCredentials({ GMAIL_USER: 'sistema@gmail.com', GMAIL_APP_PASSWORD: 'abcd efgh' })).toEqual({
      user: 'sistema@gmail.com',
      pass: 'abcd efgh',
    });
  });
});
