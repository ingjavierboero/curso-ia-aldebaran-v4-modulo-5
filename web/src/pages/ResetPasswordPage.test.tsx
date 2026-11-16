import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AppRouter } from '../router';
import type { RouteReply } from '../test/fetchMock';
import { SESSION_401, mockFetch } from '../test/fetchMock';
import { renderApp } from '../test/renderApp';

const TOKEN = 'Tk3n-Rec_' + 'A'.repeat(34);
const RESET_PATH = `/recuperar/${TOKEN}`;
const INVALID_LINK = 'El enlace no es válido o venció';
const TOO_MANY = 'Demasiados intentos. Probá de nuevo en 15 minutos.';
const SUCCESS_NOTICE = 'Contraseña cambiada. Iniciá sesión con la nueva.';
const NEXT = 'nueva-4567';

/** Rutas del enlace de recuperación y del login al que se vuelve (sistema con usuarios, sin sesión). */
function resetRoutes(check: RouteReply, confirm: RouteReply = { status: 204 }) {
  return {
    'POST /api/auth/password-reset/check': check,
    'POST /api/auth/password-reset/confirm': confirm,
    'GET /api/setup/status': { status: 200, body: { needsFirstAdmin: false } },
    'GET /api/auth/session': SESSION_401,
  };
}

async function openValidLink() {
  const rendered = renderApp(RESET_PATH);
  expect(await screen.findByRole('heading', { name: 'Definir una nueva contraseña' })).toBeInTheDocument();
  return rendered;
}

/**
 * Se falsea solo `setTimeout`, el reloj de la redirección. Con él falso no sirven `findBy*`, `waitFor`
 * ni `userEvent`: el envoltorio asíncrono de Testing Library espera un `setTimeout(0)` que solo avanza
 * con Jest. Esos tests esperan con `settleUntil` y actúan con `fireEvent`.
 * `shouldAdvanceTime: true` destrabaría `findBy*`, pero el reloj falso correría con el real: entre que
 * se arma el timer y empieza la cuenta pasan 20–40 ms medidos, sobre un margen de 100 ms (4,9 s → 5 s).
 * Con carga el chequeo de los 4,9 s fallaría sin que la página hiciera nada mal.
 */
function useFakeTimeout() {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
}

/** Deja correr las promesas pendientes (respuesta simulada, loaders, `setState`) sin mover el reloj. */
async function settle() {
  await act(async () => {
    for (let i = 0; i < 50; i++) await Promise.resolve();
  });
}

/** `settle` hasta que la aserción pase (o falle con su propio mensaje). */
async function settleUntil(assertion: () => void) {
  for (let i = 0; i < 20; i++) {
    await settle();
    try {
      assertion();
      return;
    } catch {
      // Todavía no: otra vuelta de promesas.
    }
  }
  assertion();
}

async function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
  await settle();
}

/** Abre el enlace con el reloj falso y espera el mensaje de enlace que no sirve. */
async function openDeadLink(message: string, path = RESET_PATH) {
  useFakeTimeout();
  const rendered = renderApp(path);
  await settleUntil(() => {
    expect(screen.getByText(message)).toBeInTheDocument();
  });
  return rendered;
}

/** Cuenta los 5 s de la redirección: a los 4,9 s sigue en el enlace, a los 5 s está en `/login`. */
async function expectRedirectAfterFiveSeconds(router: AppRouter, message: string, path = RESET_PATH) {
  await advance(4900);
  expect(router.state.location.pathname).toBe(path);
  expect(screen.getByText(message)).toBeInTheDocument();

  await advance(100);
  await settleUntil(() => {
    expect(router.state.location.pathname).toBe('/login');
  });
}

/** El foco quedó en el aviso que contiene `text` (W5): un lector de pantalla lo anuncia al cambiar. */
function expectFocusOn(text: string) {
  expect(document.activeElement).not.toBe(document.body);
  expect(document.activeElement).toContainElement(screen.getByText(text));
}

afterEach(() => {
  vi.useRealTimers();
  window.history.replaceState(null, '', '/');
});

describe('ResetPasswordPage', () => {
  // Con el enlace vigente se ve el formulario con la nueva contraseña y su repetición (AC-05).
  it('test_reset_page_token_valido_muestra_formulario', async () => {
    const fetchMock = mockFetch(resetRoutes({ status: 204 }));
    await openValidLink();

    expect(screen.getByLabelText('Contraseña nueva')).toHaveAttribute('type', 'password');
    expect(screen.getByLabelText('Repetir contraseña nueva')).toHaveAttribute('type', 'password');
    expect(screen.getByRole('button', { name: 'Cambiar contraseña' })).toBeEnabled();
    const checks = fetchMock.callsTo('POST', '/api/auth/password-reset/check');
    expect(checks).toHaveLength(1);
    expect(checks[0]?.body).toEqual({ token: TOKEN });
    expect(screen.queryByText(INVALID_LINK)).not.toBeInTheDocument();
  });

  // Enlace inválido o vencido: mensaje, sin formulario, y a los 5 s (no antes) el login (AC-06, AC-07).
  it('test_reset_page_token_invalido_redirige_a_los_5_segundos', async () => {
    const fetchMock = mockFetch(resetRoutes({ status: 400, body: { error: INVALID_LINK } }));
    const { router } = await openDeadLink(INVALID_LINK);
    expect(screen.queryByLabelText('Contraseña nueva')).not.toBeInTheDocument();
    expectFocusOn(INVALID_LINK);

    await expectRedirectAfterFiveSeconds(router, INVALID_LINK);
    await settleUntil(() => {
      expect(screen.getByRole('button', { name: 'Ingresar' })).toBeInTheDocument();
    });
    expect(fetchMock.callsTo('POST', '/api/auth/password-reset/check')).toHaveLength(1);
  });

  // Un bloqueo (429) al entrar muestra el mensaje del server y también vuelve al login a los 5 s.
  it('un enlace bloqueado al entrar muestra el mensaje y vuelve al login', async () => {
    mockFetch(resetRoutes({ status: 429, body: { error: TOO_MANY } }));
    const { router } = await openDeadLink(TOO_MANY);
    expect(screen.queryByLabelText('Contraseña nueva')).not.toBeInTheDocument();

    await expectRedirectAfterFiveSeconds(router, TOO_MANY);
  });

  // El enlace venció entre la apertura y la confirmación: mensaje y login a los 5 s (AC-09).
  it('test_reset_page_token_vencido_al_confirmar_rechazado', async () => {
    const fetchMock = mockFetch(resetRoutes({ status: 204 }, { status: 400, body: { error: INVALID_LINK } }));
    const { router, user } = await openValidLink();
    await user.type(screen.getByLabelText('Contraseña nueva'), NEXT);
    await user.type(screen.getByLabelText('Repetir contraseña nueva'), NEXT);

    // El reloj de la redirección arranca recién con el rechazo: se falsea antes de confirmar.
    useFakeTimeout();
    fireEvent.click(screen.getByRole('button', { name: 'Cambiar contraseña' }));
    await settleUntil(() => {
      expect(screen.getByText(INVALID_LINK)).toBeInTheDocument();
    });
    expect(fetchMock.callsTo('POST', '/api/auth/password-reset/confirm')).toHaveLength(1);
    expect(screen.queryByLabelText('Contraseña nueva')).not.toBeInTheDocument();
    expectFocusOn(INVALID_LINK);

    await expectRedirectAfterFiveSeconds(router, INVALID_LINK);
  });

  // Sin servidor al entrar (red caída o 5xx): el enlace no se puede usar; aviso y login a los 5 s.
  it('un error de red o 5xx al entrar muestra el aviso de conexión y vuelve al login', async () => {
    for (const reply of ['network-error', { status: 500, body: { error: 'x' } }] as const) {
      mockFetch(resetRoutes(reply));
      const { router, view } = await openDeadLink('No se pudo conectar con el servidor');
      expect(screen.queryByLabelText('Contraseña nueva')).not.toBeInTheDocument();
      expect(screen.queryByText(INVALID_LINK)).not.toBeInTheDocument();

      await expectRedirectAfterFiveSeconds(router, 'No se pudo conectar con el servidor');
      view.unmount();
      vi.useRealTimers();
    }
  });

  // Ir de un enlace a otro dentro de la app vuelve a validar y confirma con el token nuevo, sin
  // arrastrar el estado del anterior (W2).
  it('pasar a otro enlace lo valida de nuevo y usa su token', async () => {
    const OTHER = 'Otr0-Tk_' + 'B'.repeat(35);
    const fetchMock = mockFetch(
      resetRoutes(
        { status: 204 },
        [{ status: 400, body: { error: INVALID_LINK } }, { status: 204 }],
      ),
    );
    const { router, user } = await openValidLink();
    await user.type(screen.getByLabelText('Contraseña nueva'), NEXT);
    await user.type(screen.getByLabelText('Repetir contraseña nueva'), NEXT);
    await user.click(screen.getByRole('button', { name: 'Cambiar contraseña' }));
    expect(await screen.findByText(INVALID_LINK)).toBeInTheDocument();

    await act(() => router.navigate(`/recuperar/${OTHER}`));
    expect(await screen.findByLabelText('Contraseña nueva')).toHaveValue('');
    expect(screen.queryByText(INVALID_LINK)).not.toBeInTheDocument();
    expect(fetchMock.callsTo('POST', '/api/auth/password-reset/check').map((c) => c.body)).toEqual([
      { token: TOKEN },
      { token: OTHER },
    ]);

    await user.type(screen.getByLabelText('Contraseña nueva'), NEXT);
    await user.type(screen.getByLabelText('Repetir contraseña nueva'), NEXT);
    await user.click(screen.getByRole('button', { name: 'Cambiar contraseña' }));
    await waitFor(() => { expect(router.state.location.pathname).toBe('/login'); });
    expect(fetchMock.callsTo('POST', '/api/auth/password-reset/confirm').map((c) => c.body)).toEqual([
      { token: TOKEN, newPassword: NEXT },
      { token: OTHER, newPassword: NEXT },
    ]);
  });

  // Las contraseñas no coinciden: error en el formulario y ninguna llamada a la API (sad path).
  it('test_reset_page_contraseñas_distintas_rechazado', async () => {
    const fetchMock = mockFetch(resetRoutes({ status: 204 }));
    const { user } = await openValidLink();

    await user.type(screen.getByLabelText('Contraseña nueva'), NEXT);
    await user.type(screen.getByLabelText('Repetir contraseña nueva'), 'otra-12345');
    await user.click(screen.getByRole('button', { name: 'Cambiar contraseña' }));

    expect(await screen.findByText('Las contraseñas no coinciden')).toBeInTheDocument();
    await waitFor(() => { expect(screen.getByRole('button', { name: /Cambiar contraseña/ })).toBeEnabled(); });
    expect(fetchMock.callsTo('POST', '/api/auth/password-reset/confirm')).toHaveLength(0);
  });

  // 7 caracteres no alcanzan: error en el formulario y ninguna llamada a la API (AC-10, sad path).
  it('test_reset_page_contraseña_corta_rechazada', async () => {
    const fetchMock = mockFetch(resetRoutes({ status: 204 }));
    const { user } = await openValidLink();

    await user.type(screen.getByLabelText('Contraseña nueva'), '1234567');
    await user.type(screen.getByLabelText('Repetir contraseña nueva'), '1234567');
    await user.click(screen.getByRole('button', { name: 'Cambiar contraseña' }));

    expect(await screen.findByText('La contraseña debe tener entre 8 y 1024 caracteres')).toBeInTheDocument();
    await waitFor(() => { expect(screen.getByRole('button', { name: /Cambiar contraseña/ })).toBeEnabled(); });
    expect(fetchMock.callsTo('POST', '/api/auth/password-reset/confirm')).toHaveLength(0);
  });

  // 204 al confirmar: al login, con el aviso de éxito (AC-11).
  it('test_reset_page_exito_redirige_a_login_con_aviso', async () => {
    const fetchMock = mockFetch(resetRoutes({ status: 204 }, { status: 204 }));
    const { router, user } = await openValidLink();

    await user.type(screen.getByLabelText('Contraseña nueva'), NEXT);
    await user.type(screen.getByLabelText('Repetir contraseña nueva'), NEXT);
    await user.click(screen.getByRole('button', { name: 'Cambiar contraseña' }));

    await waitFor(() => { expect(router.state.location.pathname).toBe('/login'); });
    expect(await screen.findByText(SUCCESS_NOTICE)).toBeInTheDocument();
    const confirms = fetchMock.callsTo('POST', '/api/auth/password-reset/confirm');
    expect(confirms).toHaveLength(1);
    expect(confirms[0]?.body).toEqual({ token: TOKEN, newPassword: NEXT });
  });

  // 429 (o red) al confirmar: el mensaje en pantalla y el formulario intacto, sin redirigir (sad path).
  it('test_reset_page_bloqueo_429_error_muestra_mensaje', async () => {
    mockFetch(resetRoutes({ status: 204 }, [{ status: 429, body: { error: TOO_MANY } }, 'network-error']));
    const { router, user } = await openValidLink();

    await user.type(screen.getByLabelText('Contraseña nueva'), NEXT);
    await user.type(screen.getByLabelText('Repetir contraseña nueva'), NEXT);
    await user.click(screen.getByRole('button', { name: 'Cambiar contraseña' }));

    expect(await screen.findByText(TOO_MANY)).toBeInTheDocument();
    expect(screen.getByLabelText('Contraseña nueva')).toHaveValue(NEXT);
    expect(screen.getByLabelText('Repetir contraseña nueva')).toHaveValue(NEXT);
    await waitFor(() => { expect(screen.getByRole('button', { name: /Cambiar contraseña/ })).toBeEnabled(); });
    expect(router.state.location.pathname).toBe(RESET_PATH);

    await user.click(screen.getByRole('button', { name: /Cambiar contraseña/ }));
    expect(await screen.findByText('No se pudo conectar con el servidor')).toBeInTheDocument();
    expect(screen.getByLabelText('Contraseña nueva')).toHaveValue(NEXT);
    expect(router.state.location.pathname).toBe(RESET_PATH);
  });

  // Al montar, el token deja la barra de direcciones; la confirmación igual lo usa.
  it('test_reset_page_quita_token_de_la_barra', async () => {
    window.history.replaceState(null, '', RESET_PATH);
    const fetchMock = mockFetch(resetRoutes({ status: 204 }, { status: 204 }));
    const { user } = await openValidLink();

    expect(window.location.pathname).toBe('/recuperar');
    expect(window.location.href).not.toContain(TOKEN);

    await user.type(screen.getByLabelText('Contraseña nueva'), NEXT);
    await user.type(screen.getByLabelText('Repetir contraseña nueva'), NEXT);
    await user.click(screen.getByRole('button', { name: 'Cambiar contraseña' }));
    await waitFor(() => { expect(fetchMock.callsTo('POST', '/api/auth/password-reset/confirm')).toHaveLength(1); });
    expect(fetchMock.callsTo('POST', '/api/auth/password-reset/confirm')[0]?.body).toEqual({
      token: TOKEN,
      newPassword: NEXT,
    });
  });

  // Salir de la pantalla antes de los 5 s cancela la redirección pendiente.
  it('desmontar antes de los 5 segundos cancela la redirección', async () => {
    mockFetch(resetRoutes({ status: 400, body: { error: INVALID_LINK } }));
    const { router, view } = await openDeadLink(INVALID_LINK);

    // El router sigue vivo: si el timer no se limpiara, igual navegaría a /login.
    view.unmount();
    await advance(5000);
    expect(router.state.location.pathname).toBe(RESET_PATH);
  });
});
