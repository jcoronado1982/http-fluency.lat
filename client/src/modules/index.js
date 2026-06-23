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

function normalizeRoute(route) {
  return {
    ...route,
    enabled: route.enabled !== false,
  };
}

function normalizeRoutes(routes) {
  return (routes || []).map(normalizeRoute);
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
    return normalizeRoutes(routes);
  });
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
  return getDefaultModuleId(config) === moduleId;
}

export function getAppRoutes(config, baseRoutes = []) {
  return [
    ...baseRoutes,
    ...getModuleRoutes(config),
  ];
}

/** Ruta inicial según VITE_DEFAULT_MODULE / config.defaultModule */
export function getDefaultAppPath(config, baseRoutes = []) {
  const routes = getAppRoutes(config, baseRoutes).filter((route) => route.enabled !== false);
  const defaultModuleId = getDefaultModuleId(config);
  const defaultModule = getEnabledModules(config).find((module) => module.id === defaultModuleId);

  if (defaultModule) {
    const moduleRoutes = normalizeRoutes(
      typeof defaultModule.routes === 'function'
        ? defaultModule.routes(config)
        : defaultModule.routes,
    );
    const homeRoute = moduleRoutes.find((route) => route.path === '/') || moduleRoutes[0];
    if (homeRoute && routes.some((route) => route.path === homeRoute.path)) {
      return homeRoute.path;
    }
  }

  const preferred = routes.find((route) => route.path !== '/admin');
  return preferred?.path || routes[0]?.path || '/login';
}
