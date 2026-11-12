import { Alert, Button, Layout, Space, Typography, theme } from 'antd';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import styled from 'styled-components';
import { ApiError, errorText, getSession, logout } from '../api/authApi';
import { Stack } from '../components/Stack';
import { useAuthStore } from '../store/authStore';

/** Pantalla principal (solo con sesión: la guarda es el loader de `/`). */
export function HomePage() {
  const navigate = useNavigate();
  const { token } = theme.useToken();
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const setAnon = useAuthStore((s) => s.setAnon);
  const [loggingOut, setLoggingOut] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Al volver a la pestaña se revalida la sesión: si venció (24 h sin actividad, FR-09) el 401 lleva
  // al login (`authApi`). Un error de red no saca al usuario de la pantalla.
  // Una respuesta tardía se descarta si la pantalla ya se desmontó o si la sesión dejó de estar
  // `authed` (por ejemplo, el usuario cerró sesión mientras la consulta estaba en vuelo).
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
        <Brand $color={token.colorTextLightSolid}>Aldebaran</Brand>
        <Space>
          <HeaderText $color={token.colorTextLightSolid}>{user?.name}</HeaderText>
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
          {error && <Alert type="error" title={error} showIcon />}
          <Typography.Title level={3}>Hola, {user?.name}</Typography.Title>
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

const Brand = styled(HeaderText)`
  font-weight: 600;
`;

const PaddedContent = styled(Layout.Content)<{ $padding: number }>`
  padding: ${(p) => p.$padding}px;
`;
