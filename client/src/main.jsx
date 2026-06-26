import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './context/AuthContext.jsx';
import { initModules } from './modules/index.js';
import { detectBrowserLanguage } from './utils/browserLanguage.js';

const queryClient = new QueryClient();
const rootEl = document.getElementById('root');
const root = ReactDOM.createRoot(rootEl);

function BootstrapLoading() {
  const locale = detectBrowserLanguage();
  return (
    <div style={{
      height: '100vh',
      background: '#0f172a',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      color: '#94a3b8',
    }}
    >
      {locale === 'es' ? 'Cargando…' : 'Loading…'}
    </div>
  );
}

async function bootstrap() {
  root.render(<BootstrapLoading />);
  await initModules();
  const { default: App } = await import('./App.jsx');

  root.render(
    <React.StrictMode>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <AuthProvider>
            <App />
          </AuthProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </React.StrictMode>,
  );
}

bootstrap().catch((err) => {
  console.error('[bootstrap]', err);
  rootEl.innerHTML = '<p style="color:#f87171;padding:2rem">Error al iniciar la app. Revisa la consola.</p>';
});
