/**
 * Lógica pura de resolución de rutas (testeable sin React Router).
 */

export const DASHBOARD_HOME_PATH = '/dashboard';

export function pickHomeRoute(routes, defaultModuleId, getModuleRoutesForId) {
  const defaultModuleRoutes = getModuleRoutesForId(defaultModuleId) || [];
  const homeRoute = defaultModuleRoutes.find((route) => route.path === '/')
    || defaultModuleRoutes[0];

  if (homeRoute && routes.some((route) => route.path === homeRoute.path)) {
    return homeRoute.path;
  }

  const preferred = routes.find((route) => route.path !== '/admin' && route.path !== '/');
  return preferred?.path || routes[0]?.path || '/login';
}

export function shouldUseFlashcardLegacyAlias(landingOwnsRoot, appRoutes) {
  return !landingOwnsRoot
    && appRoutes.some((route) => route.path === '/' && route.moduleId === 'flashcards');
}

/** Home tras login: `/dashboard` si el módulo está activo; si no, módulo por defecto. */
export function resolveAuthenticatedHomePath(
  routes,
  defaultModuleId,
  getModuleRoutesForId,
  { dashboardEnabled = false } = {},
) {
  if (dashboardEnabled && routes.some((route) => route.path === DASHBOARD_HOME_PATH)) {
    return DASHBOARD_HOME_PATH;
  }
  return pickHomeRoute(routes, defaultModuleId, getModuleRoutesForId);
}

export function resolveFallbackPath(pathname, knownAppPaths, authenticatedHomePath) {
  if (knownAppPaths.has(pathname)) return null;
  if (knownAppPaths.has(authenticatedHomePath)) return authenticatedHomePath;
  return '/login';
}
