import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HEALTH_OK, deferred, mockFetch, type FetchMock } from '../test/fetchMock';
import { HealthBanner } from './HealthBanner';

const DEGRADADO_CON_DETALLE = {
  status: 503,
  body: {
    status: 'degradado',
    db: 'disponible',
    jobs: [
      { name: 'facturacion', lastRunAt: null, lastOutcome: null, late: true },
      { name: 'casilla', lastRunAt: '2026-11-14T10:00:00.000Z', lastOutcome: 'error', late: false },
      { name: 'recordatorios', lastRunAt: '2026-11-14T10:00:00.000Z', lastOutcome: 'ok', late: false },
    ],
  },
} as const;

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
          jobs: [{ name: '<img src=x onerror=alert(1)>', lastRunAt: null, lastOutcome: 'error', late: false }],
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
    mockFetch({ 'GET /api/health': { status: 503, body: { status: 'degradado' } } });
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
});
