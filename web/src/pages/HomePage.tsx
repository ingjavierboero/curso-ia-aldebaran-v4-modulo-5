import { Typography } from 'antd';
import { AppLayout } from '../components/AppLayout';
import { useAuthStore } from '../store/authStore';

/**
 * Pantalla principal (solo con sesión: la guarda es el loader de `/`). El header, el cierre de
 * sesión y la revalidación al volver a la pestaña los pone `AppLayout`.
 */
export function HomePage() {
  const user = useAuthStore((s) => s.user);

  return (
    <AppLayout>
      <Typography.Title level={3}>Hola, {user?.name}</Typography.Title>
    </AppLayout>
  );
}
