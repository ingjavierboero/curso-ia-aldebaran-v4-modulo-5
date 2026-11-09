import { ConfigProvider } from 'antd';
import esES from 'antd/locale/es_ES';
import { RouterProvider } from 'react-router/dom';
import type { AppRouter } from './router';

/** Raíz de la UI: tema/idioma de antd y el data router. `main.tsx` y los tests la montan igual. */
export function App({ router }: { router: AppRouter }) {
  return (
    <ConfigProvider locale={esES}>
      <RouterProvider router={router} />
    </ConfigProvider>
  );
}
