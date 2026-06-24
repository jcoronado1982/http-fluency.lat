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
  landing: import.meta.env.VITE_ENABLE_LANDING === 'true',
  dashboard: import.meta.env.VITE_ENABLE_DASHBOARD !== 'false',
  mockImageGen: false,
  aiEnabled: true,
  flashcards: import.meta.env.VITE_ENABLE_FLASHCARDS !== 'false',
  auth: import.meta.env.VITE_ENABLE_AUTH !== 'false',
  pronounReference: import.meta.env.VITE_ENABLE_PRONOUN_REFERENCE !== 'false',
  admin: import.meta.env.VITE_ENABLE_ADMIN !== 'false',

  grammar: import.meta.env.VITE_ENABLE_GRAMMAR === 'true',
  tests: import.meta.env.VITE_ENABLE_TESTS === 'true',
  pronounPractice:
    import.meta.env.VITE_ENABLE_PRONOUN_PRACTICE === 'true' ||
    import.meta.env.VITE_ENABLE_PRONOUN === 'true',
  payments: import.meta.env.VITE_ENABLE_PAYMENTS !== 'false',
  subscriptions: import.meta.env.VITE_ENABLE_SUBSCRIPTIONS !== 'false',
};

/** Módulo que abre en `/` (solo dominio). Ej: flashcards | pronoun */
const defaultModule = import.meta.env.VITE_DEFAULT_MODULE || 'flashcards';

const config = {
  development: {
    apiUrl: resolveApiUrl(),
    defaultModule,
    features: { ...sharedFeatures },
  },
  production: {
    apiUrl: resolveApiUrl(),
    defaultModule,
    features: { ...sharedFeatures },
  },
};

const env = import.meta.env.MODE || 'development';
export default config[env];
