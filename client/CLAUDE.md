# Frontend — Fluency (client/)

> **Documentación exclusiva del frontend.** Léela COMPLETA antes de modificar cualquier archivo bajo `client/`.
> Backend/infra: ver `CODEBASE.md` e `INFRASTRUCTURE.md` en la raíz del repo.

SPA de estudio de idiomas (flashcards con audio TTS e imágenes IA). **React 19 + Vite 8 + CSS Vanilla con CSS Modules**. Sin TypeScript, sin Redux, sin frameworks CSS (prohibido introducir Tailwind/Sass/styled-components/MUI). Estado de servidor con TanStack Query; estado de UI con Context API.

---

## 1. Arranque y sistema de módulos (leer primero)

La app NO monta rutas estáticas: se ensambla en runtime a partir de **manifiestos de módulo**.

1. `src/main.jsx` → `bootstrap()`: renderiza un loader, ejecuta `initModules()` y recién entonces importa `App.jsx` (los módulos deben estar cargados antes de calcular rutas).
2. `src/modules/index.js` es el **registry**: carga dinámicamente cada módulo según flags `VITE_ENABLE_*` y expone helpers (`getAppRoutes`, `getAppShell`, `getModuleNavSections`, `getModuleOverlays`, `getModuleShellProviders`, `notifyAuthUserSynced`…). El shell NUNCA importa internals de un módulo: todo pasa por el manifiesto.
3. `src/App.jsx` arma el árbol de rutas: `BareLayout` (rutas `layout:'bare'`: landing, login, pricing) vs shell de app (`DashboardShell` si el módulo dashboard está activo, si no `MinimalAppShell`).

**Manifiesto de módulo** (default export de `src/modules/<x>/index.jsx`):

```js
{
  id: 'flashcards',
  enabled: (config) => config.features.flashcards,
  routes: (config) => [{ path, element, layout?, public? }],
  navSections: ({ language, config }) => [...],   // sidebar
  appShell: DashboardShell,                        // solo dashboard
  overlays: (config) => <JSX/>,                    // montado fuera de las rutas
  shellProviders: (config) => [...],               // providers globales del módulo
  floatingMenuItems: ({ language, config }) => [...],
  onboarding: (ctx) => [...],
  authListeners: { onUserSynced, onLogout },       // ciclo de vida auth sin acoplar
  readResumeSession: () => sesión | null,
}
```

**Feature flags** (`.env.development`, perfiles en `client/env-profiles/*.profile`): `VITE_ENABLE_LANDING`, `VITE_ENABLE_DASHBOARD`, `VITE_ENABLE_FLASHCARDS`, `VITE_ENABLE_PAYMENTS`, `VITE_ENABLE_ADMIN`, `VITE_DEFAULT_MODULE`, `VITE_API_URL` (vacío = rutas relativas vía proxy de Vite). Config resuelta en `src/config/index.js` → `config.features.*`. El sparse-checkout puede eliminar módulos del disco: el registry solo carga los presentes.

### Receta: AGREGAR un módulo

El único punto de contacto central es UNA línea en el registry. No se toca `App.jsx`, ni el shell, ni otros módulos.

1. **Crear `src/modules/<nuevo>/index.jsx`** con el manifiesto como default export (mínimo viable):
   ```js
   const nuevoModule = {
     id: 'nuevo',
     enabled: (config) => config.features.nuevo,
     routes: (config) => [{ path: '/nuevo', element: <ProtectedRoute><NuevoPage /></ProtectedRoute> }],
     navSections: ({ language, config }) => [/* entrada de sidebar, opcional */],
   };
   export default nuevoModule;
   ```
   Estructura interna recomendada (copiar de `pricing/`, el módulo más pequeño): `ports/` + `adapters/` + `useCases/` + `composition.js` + páginas/features. Datos del backend SIEMPRE vía puerto (§2).
2. **Registrar el loader** en `src/modules/index.js` (array `moduleLoaders`), condicionado a su flag:
   ```js
   if (import.meta.env.VITE_ENABLE_NUEVO === 'true') {
     moduleLoaders.push(['nuevo', () => import('./nuevo/index.jsx')]);
   }
   ```
3. **Declarar el feature** en `src/config/index.js` (`sharedFeatures.nuevo = import.meta.env.VITE_ENABLE_NUEVO === 'true'`) y añadir `VITE_ENABLE_NUEVO` a `.env.development` y a los perfiles de `env-profiles/` que apliquen.
4. **Verificar**: `node scripts/test-routing-paths.mjs` (rutas), `npm run build`, y arrancar con el flag en `true` y en `false` (la app debe funcionar igual sin el módulo).

### Receta: QUITAR un módulo

- **Temporal (reversible, lo normal)**: poner su `VITE_ENABLE_*=false` en el perfil. Nada más — rutas, sidebar, overlays y menú flotante se recalculan solos; si era el home, `getAuthenticatedHomePath`/`pickHomeRoute` eligen otro; si era el `appShell` (dashboard), cae a `MinimalAppShell`.
- **Físico (sparse-checkout)**: quitar el directorio del disco con el perfil sparse (ver `docs/GIT_SPARSE_WORKFLOW.md`). El registry solo carga lo presente; el flag debe estar en `false` para que el `import()` no se intente.
- **Permanente (borrado real)**: eliminar `src/modules/<x>/`, su línea en `moduleLoaders`, su feature en `config/index.js` y sus flags en `.env*`/`env-profiles/`. Antes de borrar, comprobar que nada externo lo importa: `grep -rn "modules/<x>" src/ --include="*.js*"` debe devolver solo el propio módulo y el registry. Lo compartido NO se borra con el módulo: `contracts/`, `components/flashcardStudy`, `src/adapters` pertenecen al shell.

**Garantía verificada (jul 2026)**: no existen imports horizontales entre módulos (landing↛flashcards, dashboard↮flashcards); cada módulo tiene su propio `composition.js`; el perfil `admin.profile` corre la app sin módulos de estudio. Única excepción conocida: `flashcards/index.jsx` importa `isDefaultHomeModule` del registry (deuda #5, §9).

---

## 2. Arquitectura hexagonal (puertos y adaptadores)

Cada módulo replica la arquitectura del backend Rust (`fluency_core::ports`):

```
useCases (aplicación, lógica PURA, sin fetch ni React)
    ↓ consume
ports (contrato congelado: createXxxPort(adapter) → Object.freeze)
    ↓ implementado por
adapters (infraestructura: *HttpAdapter.js, usan httpClient)
    ↓ cableado en
composition.js (composition root del módulo — equivalente al wiring de api_main)
```

- **Puertos**: `src/modules/flashcards/ports/{flashcardPort,audioPort,imagePort}.js`, `src/modules/dashboard/ports/…`, `src/modules/pricing/ports/…`. Documentan el contrato con `@typedef`. Compartidos: `src/adapters/studyPorts.js`.
- **Adaptadores HTTP**: mismo directorio `adapters/` de cada módulo + `src/adapters/` (audio/imagen de estudio compartidos). Son el ÚNICO lugar con URLs de API.
- **`src/services/httpClient.js`**: cliente único — añade `Authorization: Bearer` desde `localStorage.auth_token`, lanza en non-2xx. TODO fetch pasa por aquí (no usar `fetch`/`axios` directo en componentes). Excepciones justificadas (auditadas jul 2026, no son violaciones): el beacon `keepalive:true` de `useDeckSession.flushProgressBeacon` (beforeunload no admite el httpClient), la descarga de blobs de audio en `useAudioPlayback.fetchAudioBlob` (binario, no JSON; la URL viene del puerto) y los bindings generados `services/wasm_lib.js`.
- **`composition.js`** por módulo: instancia puertos con sus adaptadores. Los componentes importan **puertos ya cableados**, jamás adaptadores.
- **useCases**: `deckUseCases.js`, `deckSessionUseCases.js`, `dashboardProgress.js`… funciones puras testeables (ordenamiento de catálogo, progreso, sesiones). La cabecera de `deckUseCases.js` documenta cómo añadir ordenamientos de categorías (toca también `contracts/catalogOrder.json` y el ETL).

**Regla de dependencias (inviolable)**: presentación → useCases/ports → adapters → httpClient. Nunca al revés; nunca un componente conoce URLs; nunca un useCase importa React.

---

## 3. Rootmap de `src/`

```
src/
├── main.jsx                    ← bootstrap asíncrono (initModules → App)
├── App.jsx                     ← árbol de rutas por capas (bare vs app shell), redirects
├── App.css                     ← layout del shell + dimensiones dinámicas flashcard (--fc-*)
├── index.css                   ← reset, :root, prefers-reduced-motion GLOBAL, tipografía app
├── config/                     ← flags/features (index.js), API_URL (api.js), traducciones
├── contracts/                  ← contratos ENTRE módulos (no tocar sin revisar consumidores):
│   ├── landingDemoNamespace.js    categoría/deck/límite del demo público + rutas de imagen
│   ├── studyMediaVariants.js      variante 'app' vs 'landing-demo' (elige proveedor TTS/imagen backend)
│   └── catalogOrder.json          orden del catálogo (sincronizado con ETL/DB)
├── context/                    ← estado global compartido:
│   ├── AuthContext.jsx            sesión JWT, restore, onboardingRequired, navigate post-login
│   ├── UIContext.jsx              idioma UI + idioma de estudio, appMessage, sidebar/menú/header
│   ├── DialogContext.jsx          confirm/alert (FluencyDialog)
│   └── AppContext.jsx             fachada: re-exporta UIProvider/useDialog
├── services/httpClient.js      ← ÚNICO cliente HTTP (JWT automático)
├── adapters/                   ← puertos+adaptadores de media de estudio compartidos (audio/imagen)
├── repositories/               ← AuthRepository (token/usuario en localStorage), adminRepository
├── hooks/usePresence.js        ← heartbeat de presencia (admin lo consume)
├── utils/                      ← browserLanguage, onboardingStorage, demoFeedbackStorage, clientInfo
├── styles/
│   ├── app-brand.css              ⭐ FUENTE ÚNICA de tokens de marca (--brand-*) por ámbitos
│   ├── fonts.css                  @font-face locales (scripts/download-fonts.js las baja)
│   └── shell-layout.css           esqueleto html/body/#root
├── pages/                      ← páginas del shell (Login, Admin, Onboarding, Grammar, Test)
├── components/
│   ├── common/                    ProtectedRoute, AdminRoute, PageLoader, LanguageSelector, FluencyDialog
│   ├── routing/SafeRedirect.jsx
│   ├── shell/                     BareLayout, MinimalAppShell, ShellFooter
│   └── flashcardStudy/         ⭐ KIT COMPARTIDO de la tarjeta (ver §4 — recién refactorizado)
│       ├── index.js               API pública: Flashcard, Controls, StudyMediaProvider, contexts
│       ├── StudyMediaContext.jsx  inyecta audioPort/imagePort/variante ('app'|'landing-demo')
│       ├── uiBridge.js            registry de acciones UI (la tarjeta activa registra handlers)
│       ├── context/flashcardStudyContext.js   los 3 contexts CANÓNICOS (ver §5)
│       └── features/              Flashcard, CardFront, CardBack, ConjugationTable,
│                                  DefinitionList, ImageViewer, Controls, HighlightedText,
│                                  useAudioPlayback, useImageGeneration, useRealViewportHeight,
│                                  useNextImagePrefetch + imagePrefetchCache (precarga de la
│                                  imagen de la tarjeta SIGUIENTE: 1 sola por delante, debounce
│                                  600ms, sin reintentos, TTL 5min; useImageGeneration consulta
│                                  la caché antes del POST a resolve-image)
│                                  + un .module.css POR componente (SRP)
└── modules/                    ← módulos con manifiesto:
    ├── index.js                   registry (ver §1)
    ├── routingPaths.js            lógica pura de rutas (testeada por scripts/test-routing-paths.mjs)
    ├── flashcards/                módulo de estudio autenticado
    │   ├── index.jsx              manifiesto (ruta '/' o '/flashcard', overlays, tour, preload)
    │   ├── composition.js         wiring flashcardPort/audioPort/imagePort
    │   ├── FlashcardPage.jsx      ORQUESTADOR de página (solo compone; sin lógica de dominio)
    │   ├── FlashcardOverlays.jsx / FlashcardOnboardingTour.jsx / OnBoardingFlashcard.jsx
    │   ├── uiBridge.js            re-export del bridge compartido
    │   ├── ports/ adapters/ useCases/ services/ (imageCompressionService: encode AVIF vía WASM)
    │   ├── context/               Providers del módulo que ALIMENTAN los contexts canónicos (§5)
    │   ├── config/                traducciones, orden de catálogo, claves de sesión, plan del tour
    │   └── features/              UI propia del módulo: CategorySelector, IpaModal, PhonicsModal,
    │                              CompletionCard, ToneSelector, CardCounter.module.css
    │                              ⚠️ Flashcard.jsx y useAudioPlayback.jsx aquí son SHIMS re-export
    │                              vivos (los usan index.jsx/tour/PhonicsModal) — NO borrar
    ├── dashboard/                 shell de app (appShell: DashboardShell) + home
    │   ├── layout/                Header, Sidebar, Footer, FloatingMenu, Layout.css
    │   └── ports/ adapters/ useCases/ features/ (stats, recomendaciones)
    ├── landing/                   pública ('/'): hero + DEMO de la tarjeta (usa el kit §4)
    └── pricing/                   PricingPage, CheckoutPage (+ ports/adapters/useCases)
```

---

## 4. El kit compartido `components/flashcardStudy` (crítico)

**Una sola tarjeta, dos consumidores**: la app autenticada (`modules/flashcards/FlashcardPage`) y el demo público de la landing (`modules/landing/features/demo`). El mismo `<Flashcard/>` renderiza ambos. Diferenciación por:

- **`StudyMediaProvider`** (`mediaVariant: 'app' | 'landing-demo'`): inyecta puertos de audio/imagen. En demo, el backend enruta a ElevenLabs+Gemini por `category='landing-demo'` (contrato en `contracts/`). El hook `useStudyMediaContext` LANZA si falta el provider.
- **`data-variant='app'|'demo'`**, **`data-layout='conjugation'|'standard'`**, **`data-state`** en el DOM: los CSS Modules estilan por estas variantes explícitas (NO por cadenas de selectores estructurales).
- **`uiBridge`**: mapa de acciones global — la tarjeta activa registra handlers (`registerUiBridgeHandler`) y el catálogo/tour los invoca (`invokeUiBridge`). Los NOMBRES de acción son contrato: no renombrar.

**Estado del refactor (jul 2026) — reglas al tocar estos archivos:**

- **0 `!important`** en todo el kit. No introducir ninguno: usa el bloque de variante correcto y orden+especificidad.
- `.cardFront` es **Grid con áreas** `'header' 'conjugation' 'examples' 'image'`; cada región declara su `grid-area` en su propio módulo CSS. Flexbox solo para grupos lineales (controles, filas de ejemplos, tabla de conjugación).
- **Piel de las caras** = variables en `.flashcardContainer`: `--fc-face-border`, `--fc-face-bg`, `--fc-face-shadow`, `--fc-card-shadow` (las variantes app-móvil y demo las redefinen). Tamaños: `--fc-card-max-width`, `--fc-card-base-height`, `--fc-image-base-width/height`. NO re-hardcodear estos valores.
- **Container Queries: decisión CERRADA y documentada** en el comentario inicial de `Flashcard.module.css`. La relación viewport→ancho de tarjeta NO es monótona (app: 620px fijos en escritorio, salta a ~748px al cruzar a ≤768px; demo hero: 282px→660px al colapsar columnas), así que ningún umbral de contenedor replica el corte de 768px. Los contenedores `flashcard`/`flashcard-face` quedan declarados solo para reglas futuras. No "modernizar" las media queries a `@container` sin nuevas mediciones.
- Solo **2 familias de breakpoints**: `max-width: 768px` (colapso de layout de página) y `min-width: 768.02px + max-height: 900px` (portátiles con poca altura). El `.02` es deliberado: con escalado fraccional del SO el ancho lógico puede ser 768.5px y no debe caer en un hueco entre bloques. No añadir breakpoints puntuales.
- **Altura real del viewport**: `useRealViewportHeight` mide `window.innerHeight` y lo publica como `--fc-real-vh` en `:root` (workaround del bug de `dvh` bajo escalado fraccional en Linux/Chromium). Toda fórmula de alto usa `var(--fc-real-vh, 100dvh)`. No volver a `dvh` puro.
- Los 8 `:global()` restantes (DefinitionList) pertenecen al **tour de onboarding** (`body:has([data-tour-step=…])`) — intocables.
- `.conjugationAudioBtn` existe en JSX pero va `display:none` deliberado (el audio se dispara al clicar la forma verbal).

**Intocables del kit** (integraciones externas al CSS): todos los `data-tour="…"`, `data-onboarding-tour`, `data-flipped`, `data-fc*`; props públicas de los componentes; eventos de teclado/click/swipe; los nombres del uiBridge.

## 5. Contextos: patrón puente (no duplicar contexts)

Los `createContext` canónicos viven en `components/flashcardStudy/context/flashcardStudyContext.js` (`FlashcardContext`, `FlashcardUiContext`, `CategoryContext`). Los **Providers** viven en `modules/flashcards/context/*` e importan esos mismos objetos (`export const FlashcardUiContext = StudyFlashcardUiContext`). Así el kit compartido consume el contexto sin depender del módulo. Si necesitas exponer algo nuevo a la tarjeta: añádelo al Provider del módulo, no crees otro context.

Estado global restante: `AuthContext` (JWT + `authRepository`), `UIContext` (**dos idiomas distintos**: `language` = idioma de interfaz, `studyLanguage` = dirección del curso es_en/en_es — no confundirlos), `DialogContext`, y TanStack Query (`queryClient` en main.jsx) para datos de servidor.

---

## 6. Arquitectura CSS (orden de capas)

1. `styles/fonts.css` → 2. `styles/app-brand.css` → 3. `styles/shell-layout.css` → 4. `index.css` (importados en ese orden en `main.jsx`); `App.css` lo importa `App.jsx`; el resto es CSS Modules por componente + CSS por página en su módulo.

- **`app-brand.css` es la ÚNICA fuente de tokens de marca** (`--brand-rose`, `--brand-gradient`, `--brand-surface`…), aplicados por ámbito (`.app-layout`, `.flashcard-page-wrapper:not([data-landing-demo])`, `.admin-page`…). Otros archivos SOLO consumen o alias-an (`--dash-*` en DashboardHome.css son alias de `--brand-*`). No redefinir tokens fuera de aquí.
- `index.css`: reset global + **`prefers-reduced-motion` global** + tipografía de la app autenticada (no landing/login).
- `App.css`: esqueleto del shell (`.main-content` es flex column DELIBERADO, no Grid: los overrides `:has()` de onboarding/móvil dependen de esa semántica) + cálculo de dimensiones de la tarjeta (`--fc-card-height` a partir de `--fc-real-vh` menos offsets de header/footer/controles). ⚠️ Historia: hubo un bug de doble conteo de altura (el shell YA reserva el header con `padding-top`; no restar el offset otra vez en contenedores hijos).
- Sidebar real 256px vs offset 260px (`--app-sidebar-width`): los 4px son aire intencional (documentado en Layout.css).
- CSS Modules hashea clases POR ARCHIVO: **no** escribir clases de un módulo en CSS plano (no matchean — esa clase de regla muerta ya se purgó de hero-demo/responsive) y **no** partir un `.module.css` sin revisar `composes` (DefinitionList/ConjugationTable componen `spinner`/`rotateVoiceBtn`/`loadingAudioBtn` desde `Flashcard.module.css`).

---

## 7. SOLID / Clean en este código (cómo se aplican al modificar)

- **SRP**: páginas orquestan, no implementan (`FlashcardPage` solo compone); cada sección visual es componente propio con su `.module.css`; cada hook una responsabilidad (`useAudioPlayback` ≠ `useImageGeneration`).
- **OCP**: features nuevas = módulo nuevo con manifiesto o entrada nueva en el manifiesto; variantes visuales = `data-variant`/variables CSS, no reescritura de reglas.
- **LSP/ISP**: los puertos son contratos congelados — un adaptador nuevo (p.ej. mock) debe implementar el typedef completo; los componentes reciben SOLO las props que usan.
- **DIP**: presentación depende de puertos, jamás de adaptadores/HTTP. Si necesitas un endpoint nuevo: añádelo al adapter, decláralo en el typedef del puerto, expónlo vía composition.js.
- **No mezclar** cambios funcionales con visuales en el mismo commit; no mover lógica entre capas sin justificación.

---

## 8. Cómo verificar cambios (obligatorio antes de dar por bueno un cambio visual)

**Levantar entorno** (la DB corre en Docker: contenedores `surrealdb` y `flashcard-db`):

```bash
cd backend && ./target/debug/api_main &      # API en :8081
cd client && npm run dev &                    # Vite en :5173 (proxy /api, /card_images, /card_audio → 8081)
curl -X POST http://127.0.0.1:5173/api/auth/dev-guest   # login local sin OAuth (JWT de invitado admin)
```

**Arnés de regresión visual** (Playwright con Chrome del sistema `channel='chrome'` + PIL):

```bash
python3 scripts/refactor_visual_shots.py /tmp/base                  # ANTES de tocar
# ... cambios ...
python3 scripts/refactor_visual_shots.py /tmp/after
python3 scripts/refactor_visual_diff.py /tmp/base /tmp/after        # PASS = ≤200px de ruido por captura
```

Captura 9 estados × 3 viewports (1920×1080, 1366×768, 390×844) con determinismo forzado (animaciones congeladas con `animation-delay:-100s`, datos aleatorios del dashboard enmascarados, espera de imágenes/spinners). Ruido conocido: catálogo-desktop ±4px, antialias del título en móvil. Para lo que el pixel-diff no cubre (bandas de viewport intermedias, dorso del demo): comparar `getComputedStyle` HEAD vs cambio con Playwright.

**Otros gates**: `npx eslint src/components/flashcardStudy` debe dar **0 errores / 0 warnings** (las excepciones de `exhaustive-deps` que quedan están justificadas con comentario); `npm run build` (genera además el manifiesto de catálogo); `npm test` — suite unitaria de lógica pura SIN framework (scripts Node planos con `node:assert/strict` en `client/scripts/test-*.mjs`: rutas, contratos landing-demo/media, deckUseCases, deckSessionUseCases, imagePrefetchCache; para módulos que leen `localStorage` dentro de una función se shimea `globalThis.localStorage` antes del import — ver `test-deck-use-cases.mjs`). Tests nuevos = otro `test-*.mjs` + entrada `test:*` en package.json + encadenarlo en `"test"`. Solo lógica pura importable desde Node: nada que importe React ni `import.meta.env`.

---

## 9. Deudas conocidas (NO "arreglar" de pasada)

Desviaciones SOLID identificadas y aceptadas (jul 2026). Son el código más delicado de la app (reintentos, carreras de generación, refs de secuencia); cualquier corrección requiere refactor planificado + arnés visual + revisión de comportamiento, nunca un fix oportunista:

1. **Hooks-dios (SRP)**: `useImageGeneration.js` (~840 líneas: resolución + pipeline de generación + upload + borrado + reintentos + demo + bootstrap), `CategorySelector.jsx` (~780), `FlashcardPage.jsx` (~530), `useAudioPlayback.jsx` (~520).
2. **Autorización en presentación**: `canGenerateImages`/`canDeleteImages` con `user?.role === 'premium'|'admin'` dentro de `useImageGeneration` — política de dominio que debería ser un useCase/policy.
3. **Fuga de infraestructura**: `useImageGeneration.js` (`pathMatchesDeck`) hardcodea el patrón `` `/card_images/${category}/…` `` en vez de delegar en `imagePort`.
4. **useCase impuro**: `deckUseCases.js` se declara "lógica pura" pero lee `localStorage` (~línea 609).
5. **Módulo→registry**: `modules/flashcards/index.jsx` importa `isDefaultHomeModule` desde `../index` (ciclo suave; funciona por import dinámico, pero invierte la dirección de dependencia).

## 10. Checklist para la IA antes de modificar el frontend

1. ¿Toca la tarjeta/kit de estudio? → relee §4; captura pixel-diff ANTES; no rompas los intocables.
2. ¿Necesita datos nuevos del backend? → adapter → typedef del puerto → composition.js → consumir el puerto (§2). Nunca fetch directo.
3. ¿Ruta/página nueva? → manifiesto del módulo correspondiente (o módulo nuevo), no `App.jsx` salvo rutas del shell.
4. ¿Estilos? → CSS Modules locales + variables existentes; tokens solo desde `app-brand.css`; cero `!important`; sin breakpoints nuevos; variantes por `data-*`.
5. ¿Estado? → ¿es de servidor? TanStack Query. ¿UI compartida? Provider existente (§5). No crear contexts nuevos sin agotar los actuales.
6. Verifica con el arnés (§8) y reporta el resultado (PASS/FAIL con píxeles) — la apariencia validada es un contrato.
7. El archivo `refactor` en la raíz del repo es la especificación de calidad CSS/estructura vigente: cualquier cambio debe seguir cumpliéndola.
