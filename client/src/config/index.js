// src/config/index.js

/**
 * Resuelve la URL base de la API.
 * - '' (vacío) → rutas relativas (/api/...) al mismo origen (prod, QA, dev con proxy).
 * - En dev, si VITE_API_URL apunta a localhost pero el navegador no está en localhost
 *   (p. ej. celular en 192.168.x.x:5173), usa rutas relativas para que el proxy de Vite funcione.
 */
function resolveApiUrl() {
  const envUrl = import.meta.env.VITE_API_URL;

  if (envUrl === '') return '';

  if (
    typeof window !== 'undefined' &&
    envUrl &&
    /localhost|127\.0\.0\.1/.test(envUrl)
  ) {
    const host = window.location.hostname;
    const onDevMachine =
      host === 'localhost' || host === '127.0.0.1';
    if (!onDevMachine) return '';
  }

  if (envUrl !== undefined) return envUrl;
  return '';
}

const sharedFeatures = {
  mockImageGen: false,
  aiEnabled: true,
  flashcards: import.meta.env.VITE_ENABLE_FLASHCARDS !== 'false',
  auth: import.meta.env.VITE_ENABLE_AUTH !== 'false',
  storyArcade: import.meta.env.VITE_ENABLE_STORY_ARCADE !== 'false',
  payments: import.meta.env.VITE_ENABLE_PAYMENTS === 'true',
  subscriptions: import.meta.env.VITE_ENABLE_SUBSCRIPTIONS === 'true',
};

const config = {
  development: {
    apiUrl: resolveApiUrl(),
    features: { ...sharedFeatures },
  },
  production: {
    apiUrl: resolveApiUrl(),
    features: { ...sharedFeatures },
  },
};

const env = import.meta.env.MODE || 'development';
export default config[env];
