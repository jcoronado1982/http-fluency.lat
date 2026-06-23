import {
  pickHomeRoute as pickHomeRoutePure,
  resolveAuthenticatedHomePath,
  resolveFallbackPath,
  shouldUseFlashcardLegacyAlias,
} from './routingPaths';

const moduleLoaders = import.meta.glob('./*/index.jsx');

/** @type {Array<{ id: string, enabled?: Function, routes?: Function, [key: string]: unknown }>} */
let modules = [];

/** Carga los módulos presentes físicamente; sparse-checkout decide qué existe en disco. */
export async function initModules() {
  modules = [];

  const paths = Object.keys(moduleLoaders).sort();
  for (const path of paths) {
    const loadModule = moduleLoaders[path];
    const { default: moduleDef } = await loadModule();
    if (!moduleDef?.id) {
      throw new Error(`Module '${path}' must export a default object with an id`);
    }
    modules.push(moduleDef);
  }

  return modules;
}

function normalizeRoute(route, moduleId) {
  return {
    ...route,
    moduleId,
    layout: route.layout || 'app',
    enabled: route.enabled !== false,
  };
}

function normalizeRoutes(routes, moduleId) {
  return (routes || []).map((route) => normalizeRoute(route, moduleId));
}

export function getEnabledModules(config) {
  return modules.filter((module) => {
    if (typeof module.enabled === 'function') return module.enabled(config);
    return module.enabled !== false;
  });
}

export function getModuleRoutes(config) {
  return getEnabledModules(config).flatMap((module) => {
    const routes = typeof module.routes === 'function'
      ? module.routes(config)
      : module.routes;
    return normalizeRoutes(routes, module.id);
  });
}

export function isLandingHomeActive(config) {
  return Boolean(
    config?.features?.landing
    && getEnabledModules(config).some((module) => module.id === 'landing'),
  );
}

export function getAppShell(config) {
  const dashboard = getEnabledModules(config).find(
    (module) => module.id === 'dashboard' && module.appShell,
  );
  return dashboard?.appShell || null;
}

export function getModuleNavSections(config, context) {
  return getEnabledModules(config).flatMap((module) => {
    const sections = typeof module.navSections === 'function'
      ? module.navSections({ ...context, config })
      : module.navSections;
    return sections || [];
  });
}

export function getModuleOverlays(config) {
  return getEnabledModules(config).flatMap((module) => {
    if (typeof module.overlays !== 'function') return [];
    const overlay = module.overlays(config);
    return overlay ? [overlay] : [];
  });
}

export function getModuleFloatingMenuItems(config, context) {
  return getEnabledModules(config).flatMap((module) => {
    if (typeof module.floatingMenuItems !== 'function') return [];
    return module.floatingMenuItems({ ...context, config }) || [];
  });
}

/** Providers de shell que un módulo necesita montar fuera de sus rutas (ej. UI bridge). */
export function getModuleShellProviders(config) {
  return getEnabledModules(config).flatMap((module) => {
    if (typeof module.shellProviders === 'function') return module.shellProviders(config);
    return module.shellProviders || [];
  });
}

export function getDefaultModuleId(config) {
  return config?.defaultModule || import.meta.env.VITE_DEFAULT_MODULE || 'flashcards';
}

export function isDefaultHomeModule(moduleId, config) {
  if (isLandingHomeActive(config)) return false;
  return getDefaultModuleId(config) === moduleId;
}

export function getAppRoutes(config, baseRoutes = []) {
  const normalizedBase = (baseRoutes || []).map((route) => normalizeRoute(route, 'shell'));
  return [
    ...normalizedBase,
    ...getModuleRoutes(config),
  ];
}

function pickHomeRoute(routes, config) {
  const defaultModuleId = getDefaultModuleId(config);
  return pickHomeRoutePure(routes, defaultModuleId, (moduleId) => {
    const mod = getEnabledModules(config).find((m) => m.id === moduleId);
    if (!mod) return [];
    return normalizeRoutes(
      typeof mod.routes === 'function' ? mod.routes(config) : mod.routes,
      mod.id,
    );
  });
}

/** Ruta inicial pública (puede ser landing en `/`). */
export function getDefaultAppPath(config, baseRoutes = []) {
  const routes = getAppRoutes(config, baseRoutes).filter((route) => route.enabled !== false);
  return pickHomeRoute(routes, config);
}

function getAuthenticatedAppRoutes(config, baseRoutes = []) {
  return getAppRoutes(config, baseRoutes).filter((route) => {
    if (route.enabled === false) return false;
    if (route.layout === 'bare' || route.public) return false;
    if (route.moduleId === 'landing') return false;
    return true;
  });
}

function isDashboardModuleEnabled(config) {
  return Boolean(
    config?.features?.dashboard
    && getEnabledModules(config).some((module) => module.id === 'dashboard'),
  );
}

/** Ruta tras login: `/dashboard` si el módulo dashboard está activo; si no, módulo por defecto. */
export function getAuthenticatedHomePath(config, baseRoutes = []) {
  const routes = getAuthenticatedAppRoutes(config, baseRoutes);
  return resolveAuthenticatedHomePath(
    routes,
    getDefaultModuleId(config),
    (moduleId) => {
      const mod = getEnabledModules(config).find((m) => m.id === moduleId);
      if (!mod) return [];
      return normalizeRoutes(
        typeof mod.routes === 'function' ? mod.routes(config) : mod.routes,
        mod.id,
      );
    },
    { dashboardEnabled: isDashboardModuleEnabled(config) },
  );
}

export { resolveFallbackPath, shouldUseFlashcardLegacyAlias };
