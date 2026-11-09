import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { createAppRouter } from './router';

const container = document.getElementById('root');
if (!container) throw new Error('No existe el elemento #root');

createRoot(container).render(
  <StrictMode>
    <App router={createAppRouter()} />
  </StrictMode>,
);
