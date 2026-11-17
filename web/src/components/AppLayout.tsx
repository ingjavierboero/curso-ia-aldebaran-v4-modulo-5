import { Alert, Button, Layout, Space, theme } from 'antd';
import { useEffect, useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import styled from 'styled-components';
import { ApiError, errorText, getSession, logout } from '../api/authApi';
import { useAuthStore } from '../store/authStore';
import { HealthBanner } from './HealthBanner';
import { Stack } from './Stack';

/** Aviso que una pantalla con sesión deja a otra al navegar (por ejemplo, acceso denegado). */
interface LayoutNotice {
  text: string;
}

/** `state` listo para `navigate(path, { state })`: la pantalla de destino lo muestra como aviso. */
export function layoutNoticeState(text: string): { layoutNotice: LayoutNotice } {
  return { layoutNotice: { text } };
}

/** Lee el aviso de `location.state`; cualquier otra forma se ignora. */
function readLayoutNotice(state: unknown): LayoutNotice | null {
  if (typeof state !== 'object' || state === null) return null;
  const notice = (state as { layoutNotice?: unknown }).layoutNotice;
  if (typeof notice !== 'object' || notice === null) return null;
  const { text } = notice as { text?: unknown };
  return typeof text === 'string' ? { text } : null;
}

/**
 * Marco de las pantallas con sesión: header (marca, nombre, "Clientes", "Productos", "Configuración"
 * y "Mi perfil" para todos los perfiles, acceso a usuarios solo para Admin y "Cerrar sesión") y el
 * banner de salud. Los botones son UX: la autorización real es la del server (FEAT-006, FR-13;
 * FEAT-011: la configuración la ven los tres perfiles y solo el Admin la cambia).
 */
export function AppLayout({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { token } = theme.useToken();
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const setAnon = useAuthStore((s) => s.setAnon);
  const [loggingOut, setLoggingOut] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<LayoutNotice | null>(() => readLayoutNotice(location.state));

  // El aviso se muestra una vez: se guarda en el estado de la pantalla y se saca de la entrada del
  // historial (reemplazándola), para que recargar la página (F5) o volver atrás no lo repita.
  useEffect(() => {
    const incoming = readLayoutNotice(location.state);
    if (incoming === null) return;
    setNotice(incoming);
    void navigate(location.pathname, { replace: true, state: null });
  }, [location.state, location.pathname, navigate]);

  // Al volver a la pestaña se revalida la sesión: si venció (24 h sin actividad, FR-09) el 401 lleva
  // al login (`client`); si cambió el perfil, el header se actualiza. Un error de red no saca al
  // usuario de la pantalla. Una respuesta tardía se descarta si la pantalla ya se desmontó o si la
  // sesión dejó de estar `authed` (por ejemplo, el usuario cerró sesión mientras la consulta estaba en vuelo).
  useEffect(() => {
    let cancelled = false;
    function revalidate() {
      getSession().then(
        (fresh) => {
          if (cancelled || useAuthStore.getState().status !== 'authed') return;
          setUser(fresh);
        },
        () => {},
      );
    }
    window.addEventListener('focus', revalidate);
    return () => {
      cancelled = true;
      window.removeEventListener('focus', revalidate);
    };
  }, [setUser]);

  async function onLogout() {
    setLoggingOut(true);
    setError(null);
    try {
      await logout();
      setAnon();
      void navigate('/login', { replace: true });
    } catch (err) {
      // Un 401 ya llevó al login (la sesión no existía); el resto se informa.
      if (err instanceof ApiError && err.status === 401) return;
      setError(errorText(err));
      setLoggingOut(false);
    }
  }

  return (
    <FullHeight>
      <HeaderBar>
        <Brand to="/" $color={token.colorTextLightSolid}>
          Aldebaran
        </Brand>
        <Space>
          <HeaderText $color={token.colorTextLightSolid}>{user?.name}</HeaderText>
          <Button
            onClick={() => {
              void navigate('/clientes');
            }}
          >
            Clientes
          </Button>
          <Button
            onClick={() => {
              void navigate('/productos');
            }}
          >
            Productos
          </Button>
          <Button
            onClick={() => {
              void navigate('/configuracion');
            }}
          >
            Configuración
          </Button>
          <Button
            onClick={() => {
              void navigate('/perfil');
            }}
          >
            Mi perfil
          </Button>
          {user?.role === 'admin' && (
            <Button
              onClick={() => {
                void navigate('/usuarios');
              }}
            >
              Usuarios
            </Button>
          )}
          <Button
            onClick={() => {
              void onLogout();
            }}
            loading={loggingOut}
          >
            Cerrar sesión
          </Button>
        </Space>
      </HeaderBar>
      <PaddedContent $padding={token.paddingLG}>
        <Stack orientation="vertical" size="middle">
          <HealthBanner />
          {notice && <Alert type="warning" title={notice.text} showIcon />}
          {error && <Alert type="error" title={error} showIcon />}
          {children}
        </Stack>
      </PaddedContent>
    </FullHeight>
  );
}

const FullHeight = styled(Layout)`
  min-height: 100vh;
`;

const HeaderBar = styled(Layout.Header)`
  display: flex;
  align-items: center;
  justify-content: space-between;
`;

/** Texto sobre el header oscuro; el color sale del tema de antd (`colorTextLightSolid`). */
const HeaderText = styled.span<{ $color: string }>`
  color: ${(p) => p.$color};
`;

const Brand = styled(Link)<{ $color: string }>`
  color: ${(p) => p.$color};
  font-weight: 600;
`;

const PaddedContent = styled(Layout.Content)<{ $padding: number }>`
  padding: ${(p) => p.$padding}px;
`;
