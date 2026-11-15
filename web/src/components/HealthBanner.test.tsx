import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setUnauthorizedHandler } from '../api/authApi';
import { useAuthStore } from '../store/authStore';
import { ANA, HEALTH_OK, SESSION_401, deferred, mockFetch, type FetchMock } from '../test/fetchMock';
import { HealthBanner } from './HealthBanner';

const DEGRADADO_CON_DETALLE = {
  status: 503,
  body: {
    status: 'degradado',
    db: 'disponible',
    jobs: [
      { name: 'facturacion', lastRunAt: null, lastOutcome: null, late: true, readFailed: false },
      { name: 'casilla', lastRunAt: '2026-11-14T10:00:00.000Z', lastOutcome: 'error', late: false, readFailed: false },
      { name: 'recordatorios', lastRunAt: '2026-11-14T10:00:00.000Z', lastOutcome: 'ok', late: false, readFailed: false },
    ],
  },
} as const;

/** "Degradado" sin detalle: la respuesta anónima, o la de un usuario con la base caída. */
const DEGRADADO_SIN_DETALLE = { status: 503, body: { status: 'degradado' } } as const;

const SESSION_OK = { status: 200, body: { user: ANA } } as const;

/** Solo se falsean los intervalos: `findBy*` sigue con timers reales. */
function useFakeInterval() {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
}

/**
 * Deja correr las promesas pendientes (respuesta simulada, `response.json()` y el `setState`) sin
 * esperar tiempo real: con un body en memoria todo eso se resuelve en microtareas.
 */
async function settle() {
  await act(async () => {
    for (let i = 0; i < 50; i++) await Promise.resolve();
  });
}

/** Avanza el reloj falso `ms` y deja asentar lo que haya disparado el intervalo. */
async function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
  await settle();
}

function healthCalls(fetchMock: FetchMock) {
  return fetchMock.callsTo('GET', '/api/health');
}

function sessionCalls(fetchMock: FetchMock) {
  return fetchMock.callsTo('GET', '/api/auth/session');
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('HealthBanner', () => {
  it('test_banner_visible_con_estado_degradado_nombra_lo_degradado', async () => {
    const fetchMock = mockFetch({ 'GET /api/health': DEGRADADO_CON_DETALLE });
    const first = render(<HealthBanner />);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('facturacion');
    expect(alert).toHaveTextContent('casilla');
    expect(alert).not.toHaveTextContent('recordatorios');
    expect(alert).not.toHaveTextContent('Base de datos');
    const [call] = healthCalls(fetchMock);
    expect(call?.init?.credentials).toBe('include');
    first.unmount();

    // Base caída con detalle: nombra "Base de datos"; un nombre con HTML se muestra como texto.
    mockFetch({
      'GET /api/health': {
        status: 503,
        body: {
          status: 'degradado',
          db: 'no_disponible',
          jobs: [
            { name: '<img src=x onerror=alert(1)>', lastRunAt: null, lastOutcome: 'error', late: false, readFailed: false },
          ],
        },
      },
    });
    const { container } = render(<HealthBanner />);
    const second = await screen.findByRole('alert');
    expect(second).toHaveTextContent('Base de datos');
    expect(second).toHaveTextContent('<img src=x onerror=alert(1)>');
    expect(container.querySelector('img')).toBeNull();
  });

  it('test_banner_degradado_sin_detalle_nombra_base_de_datos', async () => {
    // Desde FEAT-004 el "degradado" sin detalle pasa por la confirmación de sesión.
    mockFetch({ 'GET /api/health': DEGRADADO_SIN_DETALLE, 'GET /api/auth/session': SESSION_OK });
    render(<HealthBanner />);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Base de datos');
  });

  it('test_banner_oculto_con_estado_ok', async () => {
    const fetchMock = mockFetch({ 'GET /api/health': HEALTH_OK });
    const first = render(<HealthBanner />);

    await settle();
    expect(healthCalls(fetchMock)).toHaveLength(1);
    expect(healthCalls(fetchMock)[0]?.init?.credentials).toBe('include');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    first.unmount();

    // 200 sin detalle (la sesión se perdió) después de un degradado: el banner desaparece.
    useFakeInterval();
    const anon = mockFetch({ 'GET /api/health': [DEGRADADO_CON_DETALLE, { status: 200, body: { status: 'ok' } }] });
    render(<HealthBanner />);
    await settle();
    expect(screen.getByRole('alert')).toHaveTextContent('facturacion');

    await advance(60_000);
    expect(healthCalls(anon)).toHaveLength(2);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('test_banner_se_actualiza_cada_60_segundos', async () => {
    useFakeInterval();
    const fetchMock = mockFetch({ 'GET /api/health': [HEALTH_OK, DEGRADADO_CON_DETALLE, HEALTH_OK] });
    const view = render(<HealthBanner />);

    await settle();
    expect(healthCalls(fetchMock)).toHaveLength(1);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    await advance(59_999);
    expect(healthCalls(fetchMock)).toHaveLength(1);

    await advance(1);
    expect(healthCalls(fetchMock)).toHaveLength(2);
    expect(screen.getByRole('alert')).toHaveTextContent('facturacion');

    await advance(60_000);
    expect(healthCalls(fetchMock)).toHaveLength(3);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    // Al desmontar se limpia el intervalo: no hay más consultas.
    view.unmount();
    await advance(180_000);
    expect(healthCalls(fetchMock)).toHaveLength(3);
  });

  it('test_banner_error_de_red_conserva_ultimo_estado', async () => {
    useFakeInterval();
    const fetchMock = mockFetch({
      'GET /api/health': [
        DEGRADADO_CON_DETALLE,
        'network-error',
        { status: 200, body: { status: 'roto' } },
        { status: 200, body: { foo: 1 } },
        { status: 500, body: { error: 'Error interno' } },
        { status: 401, body: { error: 'Sesión no válida' } },
      ],
    });
    render(<HealthBanner />);

    await settle();
    expect(screen.getByRole('alert')).toHaveTextContent('facturacion');

    for (let i = 2; i <= 6; i++) {
      await advance(60_000);
      expect(healthCalls(fetchMock)).toHaveLength(i);
      const alert = screen.getByRole('alert');
      expect(alert).toHaveTextContent('facturacion');
      expect(alert).toHaveTextContent('casilla');
    }
    // Ningún reintento fuera del intervalo.
    await settle();
    expect(healthCalls(fetchMock)).toHaveLength(6);
  });

  it('test_banner_respuesta_lenta_no_pisa_una_mas_nueva', async () => {
    useFakeInterval();
    const slowDegradado = deferred();
    const fastOk = deferred();
    const fetchMock = mockFetch({ 'GET /api/health': [slowDegradado.reply, fastOk.reply] });
    render(<HealthBanner />);
    await settle();

    // La segunda consulta sale con la primera todavía en vuelo; la primera queda abortada.
    await advance(60_000);
    expect(healthCalls(fetchMock)).toHaveLength(2);
    expect(healthCalls(fetchMock)[0]?.init?.signal?.aborted).toBe(true);

    // Responden en orden inverso: primero la nueva (ok), después la vieja (degradado).
    fastOk.resolve(HEALTH_OK);
    await settle();
    slowDegradado.resolve(DEGRADADO_CON_DETALLE);
    await settle();

    // Queda el estado de la segunda respuesta.
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('test_banner_respuesta_tardia_rechazada_tras_desmontar', async () => {
    useFakeInterval();
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const late = deferred();
    const fetchMock = mockFetch({ 'GET /api/health': late.reply });
    const view = render(<HealthBanner />);

    await settle();
    expect(healthCalls(fetchMock)).toHaveLength(1);
    const signal = healthCalls(fetchMock)[0]?.init?.signal;
    expect(signal?.aborted).toBe(false);

    view.unmount();
    // Desmontar aborta la consulta en vuelo: su respuesta ya no puede llegar al estado.
    expect(signal?.aborted).toBe(true);

    late.resolve(DEGRADADO_CON_DETALLE);
    await settle();
    await advance(120_000);

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(healthCalls(fetchMock)).toHaveLength(1);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('test_banner_degradado_sin_detalle_confirma_sesion_una_vez', async () => {
    useFakeInterval();
    const firstSession = deferred();
    const fetchMock = mockFetch({
      'GET /api/health': DEGRADADO_SIN_DETALLE,
      'GET /api/auth/session': [firstSession.reply, SESSION_OK],
    });
    render(<HealthBanner />);
    await settle();

    // Una sola confirmación por consulta, y el banner espera su respuesta.
    expect(sessionCalls(fetchMock)).toHaveLength(1);
    expect(sessionCalls(fetchMock)[0]?.init?.credentials).toBe('include');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    firstSession.resolve(SESSION_OK);
    await settle();
    expect(screen.getByRole('alert')).toHaveTextContent('Base de datos');
    expect(sessionCalls(fetchMock)).toHaveLength(1);

    // La consulta siguiente (60 s) confirma otra vez, una sola.
    await advance(60_000);
    expect(healthCalls(fetchMock)).toHaveLength(2);
    expect(sessionCalls(fetchMock)).toHaveLength(2);
  });

  it('test_banner_sesion_no_autorizada_lleva_al_login_sin_banner', async () => {
    useFakeInterval();
    const toLogin = vi.fn();
    setUnauthorizedHandler(toLogin);
    const fetchMock = mockFetch({
      'GET /api/health': [DEGRADADO_CON_DETALLE, DEGRADADO_SIN_DETALLE],
      'GET /api/auth/session': SESSION_401,
    });
    render(<HealthBanner />);
    await settle();
    expect(screen.getByRole('alert')).toHaveTextContent('facturacion');

    await advance(60_000);
    expect(sessionCalls(fetchMock)).toHaveLength(1);
    // El camino común de 401: store en anon y navegación al login.
    expect(toLogin).toHaveBeenCalledTimes(1);
    expect(useAuthStore.getState().status).toBe('anon');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByText(/Base de datos/)).not.toBeInTheDocument();
  });

  it('test_banner_sesion_valida_nombra_base_de_datos', async () => {
    useFakeInterval();
    const fetchMock = mockFetch({
      'GET /api/health': [HEALTH_OK, DEGRADADO_SIN_DETALLE],
      'GET /api/auth/session': SESSION_OK,
    });
    render(<HealthBanner />);
    await settle();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    await advance(60_000);
    expect(sessionCalls(fetchMock)).toHaveLength(1);
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Con problemas: Base de datos');
  });

  it('test_banner_confirmacion_error_de_red_conserva_ultimo', async () => {
    useFakeInterval();
    const fetchMock = mockFetch({
      'GET /api/health': [DEGRADADO_CON_DETALLE, DEGRADADO_SIN_DETALLE, HEALTH_OK, DEGRADADO_SIN_DETALLE],
      'GET /api/auth/session': 'network-error',
    });
    render(<HealthBanner />);
    await settle();
    expect(screen.getByRole('alert')).toHaveTextContent('facturacion');

    // Con banner: se conserva lo que mostraba, sin pasar a "Base de datos".
    await advance(60_000);
    expect(sessionCalls(fetchMock)).toHaveLength(1);
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('facturacion');
    expect(alert).toHaveTextContent('casilla');
    expect(alert).not.toHaveTextContent('Base de datos');

    // Sin banner: sigue sin banner.
    await advance(60_000);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    await advance(60_000);
    expect(sessionCalls(fetchMock)).toHaveLength(2);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('test_banner_confirmacion_error_del_servidor_nombra_base_de_datos', async () => {
    useFakeInterval();
    const fetchMock = mockFetch({
      'GET /api/health': [HEALTH_OK, DEGRADADO_SIN_DETALLE],
      'GET /api/auth/session': { status: 500, body: { error: 'Error interno' } },
    });
    render(<HealthBanner />);
    await settle();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    // Antes no mostraba nada: un 5xx en la confirmación nombra la base igual.
    await advance(60_000);
    expect(sessionCalls(fetchMock)).toHaveLength(1);
    expect(screen.getByRole('alert')).toHaveTextContent('Con problemas: Base de datos');
  });

  it('test_banner_no_confirma_sesion_con_ok_ni_con_detalle', async () => {
    useFakeInterval();
    const fetchMock = mockFetch({
      'GET /api/health': [
        HEALTH_OK,
        DEGRADADO_CON_DETALLE,
        { status: 200, body: { status: 'ok' } },
        DEGRADADO_SIN_DETALLE,
      ],
      'GET /api/auth/session': SESSION_OK,
    });
    render(<HealthBanner />);
    await settle();
    await advance(60_000);
    expect(screen.getByRole('alert')).toHaveTextContent('facturacion');
    await advance(60_000);

    expect(healthCalls(fetchMock)).toHaveLength(3);
    expect(sessionCalls(fetchMock)).toHaveLength(0);

    // Control: la única respuesta que confirma es el "degradado" sin detalle.
    await advance(60_000);
    expect(healthCalls(fetchMock)).toHaveLength(4);
    expect(sessionCalls(fetchMock)).toHaveLength(1);
  });

  it('test_banner_nombra_proceso_con_lectura_fallida', async () => {
    mockFetch({
      'GET /api/health': {
        status: 503,
        body: {
          status: 'degradado',
          db: 'disponible',
          jobs: [
            { name: 'facturacion', lastRunAt: null, lastOutcome: null, late: false, readFailed: true },
            { name: 'casilla', lastRunAt: '2026-11-14T10:00:00.000Z', lastOutcome: 'ok', late: false, readFailed: false },
          ],
        },
      },
    });
    render(<HealthBanner />);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Con problemas: facturacion');
    expect(alert).not.toHaveTextContent('casilla');
    expect(alert).not.toHaveTextContent('Base de datos');
  });

  it('test_banner_respuesta_sin_read_failed_invalida_conserva_ultimo', async () => {
    useFakeInterval();
    const fetchMock = mockFetch({
      'GET /api/health': [
        DEGRADADO_CON_DETALLE,
        {
          status: 503,
          body: {
            status: 'degradado',
            db: 'disponible',
            jobs: [{ name: 'otro', lastRunAt: null, lastOutcome: 'error', late: true }],
          },
        },
        {
          status: 503,
          body: {
            status: 'degradado',
            db: 'disponible',
            jobs: [{ name: 'otro', lastRunAt: null, lastOutcome: 'error', late: true, readFailed: 'si' }],
          },
        },
      ],
    });
    render(<HealthBanner />);
    await settle();
    expect(screen.getByRole('alert')).toHaveTextContent('facturacion');

    for (let i = 2; i <= 3; i++) {
      await advance(60_000);
      expect(healthCalls(fetchMock)).toHaveLength(i);
      const alert = screen.getByRole('alert');
      expect(alert).toHaveTextContent('facturacion');
      expect(alert).not.toHaveTextContent('otro');
    }
  });

  it('test_banner_confirmacion_tardia_tras_desmontar_se_descarta', async () => {
    useFakeInterval();
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const lateSession = deferred();
    const fetchMock = mockFetch({
      'GET /api/health': DEGRADADO_SIN_DETALLE,
      'GET /api/auth/session': lateSession.reply,
    });
    const view = render(<HealthBanner />);
    await settle();
    expect(sessionCalls(fetchMock)).toHaveLength(1);

    view.unmount();
    lateSession.resolve(SESSION_OK);
    await settle();
    await advance(120_000);

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(healthCalls(fetchMock)).toHaveLength(1);
    expect(sessionCalls(fetchMock)).toHaveLength(1);
    expect(errorSpy).not.toHaveBeenCalled();
  });
});
