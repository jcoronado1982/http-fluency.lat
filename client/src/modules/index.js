import flashcardsModule from './flashcards/index.jsx';

const pronounModuleLoaders = import.meta.glob('./pronounPractice/index.jsx');

/** @type {Array<{ id: string, enabled?: Function, routes?: Function, [key: string]: unknown }>} */
let modules = [];

function flashcardsBuildEnabled() {
  return import.meta.env.VITE_ENABLE_FLASHCARDS !== 'false';
}

function pronounBuildEnabled() {
  if (
    import.meta.env.VITE_ENABLE_PRONOUN_PRACTICE === 'false'
    && import.meta.env.VITE_ENABLE_PRONOUN_REFERENCE === 'false'
  ) {
    return false;
  }
  if (
    import.meta.env.VITE_ENABLE_PRONOUN_PRACTICE === 'true'
    || import.meta.env.VITE_ENABLE_PRONOUN === 'true'
  ) {
    return true;
  }
  return import.meta.env.VITE_ENABLE_PRONOUN_REFERENCE !== 'false';
}

/** Carga solo los módulos activos según VITE_* (evita importar pronoun en perfil flashcards). */
export async function initModules() {
  modules = [];

  if (flashcardsBuildEnabled()) {
    modules.push(flashcardsModule);
  }

  if (pronounBuildEnabled()) {
    const loadPronounModule = pronounModuleLoaders['./pronounPractice/index.jsx'];
    if (loadPronounModule) {
      const { default: pronounModule } = await loadPronounModule();
      modules.push(pronounModule);
    }
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
