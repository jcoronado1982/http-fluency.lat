import assert from 'node:assert/strict';
import {
  DASHBOARD_HOME_PATH,
  pickHomeRoute,
  resolveAuthenticatedHomePath,
  resolveFallbackPath,
  shouldUseFlashcardLegacyAlias,
} from '../src/modules/routingPaths.js';

const flashcardRoutes = [{ path: '/flashcard', moduleId: 'flashcards', layout: 'app' }];
const dashboardRoutes = [{ path: DASHBOARD_HOME_PATH, moduleId: 'dashboard', layout: 'app' }];
const landingRoutes = [{ path: '/', moduleId: 'landing', layout: 'bare', public: true }];

// Landing activo: home autenticado = /flashcard (sin dashboard)
assert.equal(
  pickHomeRoute(
    [...landingRoutes, ...flashcardRoutes],
    'flashcards',
    () => [{ path: '/flashcard', moduleId: 'flashcards' }],
  ),
  '/flashcard',
);

// Con dashboard activo: login cae en /dashboard
assert.equal(
  resolveAuthenticatedHomePath(
    [...landingRoutes, ...dashboardRoutes, ...flashcardRoutes],
    'flashcards',
    () => [{ path: '/flashcard', moduleId: 'flashcards' }],
    { dashboardEnabled: true },
  ),
  DASHBOARD_HOME_PATH,
);

// Sin dashboard: sigue siendo /flashcard
assert.equal(
  resolveAuthenticatedHomePath(
    [...landingRoutes, ...flashcardRoutes],
    'flashcards',
    () => [{ path: '/flashcard', moduleId: 'flashcards' }],
    { dashboardEnabled: false },
  ),
  '/flashcard',
);

// Sin landing: flashcards en /
const rootFlashcards = [{ path: '/', moduleId: 'flashcards', layout: 'app' }];
assert.equal(
  pickHomeRoute(
    rootFlashcards,
    'flashcards',
    () => [{ path: '/', moduleId: 'flashcards' }],
  ),
  '/',
);

// Legacy alias solo sin landing
assert.equal(
  shouldUseFlashcardLegacyAlias(false, rootFlashcards),
  true,
);
assert.equal(
  shouldUseFlashcardLegacyAlias(true, flashcardRoutes),
  false,
);

// Fallback no redirige si ya estamos en destino
assert.equal(
  resolveFallbackPath(DASHBOARD_HOME_PATH, new Set([DASHBOARD_HOME_PATH, '/flashcard']), DASHBOARD_HOME_PATH),
  null,
);
assert.equal(
  resolveFallbackPath('/unknown', new Set([DASHBOARD_HOME_PATH, '/flashcard']), DASHBOARD_HOME_PATH),
  DASHBOARD_HOME_PATH,
);

console.log('routingPaths: OK');
