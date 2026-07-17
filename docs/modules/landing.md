# Módulo `landing` — Página pública de marketing

## Propósito

Página pública en `/` (layout `bare`, sin sidebar): hero de marketing + **demo interactivo de la
flashcard** sin login. Es la puerta de conversión hacia registro/pricing.

## Estado y roadmap

- Estado: **activo** en producción (opt-in por flag).
- SEO off-page: plan en [`../SEO_DISTRIBUTION_PLAN.md`](../SEO_DISTRIBUTION_PLAN.md).

## Mapa de archivos

| Capa | Ruta | Qué contiene |
|---|---|---|
| Frontend | `client/src/modules/landing/` | `index.jsx` (manifiesto), `LandingPage.jsx` + `.css`, `landingSections.js`, `composition.js`, `config/`, `data/`, `styles/` |
| Demo de tarjeta | `client/src/modules/landing/features/` (p. ej. `DemoFlashcardSession.jsx`) | usa el kit compartido `client/src/components/flashcardStudy/` con `mediaVariant='landing-demo'` |
| Contratos demo | `client/src/contracts/landingDemoNamespace.js`, `studyMediaVariants.js` | categoría/deck/límite del demo y variante de media |
| Backend (demo) | sin crate propio | el demo consume endpoints de flashcards con `category='landing-demo'`; TTS del demo: `backend/api_main/src/infrastructure/ai/elevenlabs_tts_provider.rs` (ElevenLabs SOLO aquí) |
| Audio demo | `card_audio/landing-demo/` (162 MP3 + 164 metadatos JSON) | copiados por el pipeline en cada deploy |

## Contratos / endpoints

Sin crate backend propio. El demo usa estos contratos HTTP:

| Método y ruta | Auth | Entrada/salida relevante |
|---|---|---|
| `GET /api/demo-feedback?limit=1..50` | pública | `{ summary: { average, count }, reviews[] }`; el backend limita el máximo a 50 |
| `POST /api/demo-feedback` | JWT | `{ comment, rating, language, source: "landing-demo" }`; comentario 1..500 caracteres Unicode y rating 1..5 |
| `POST /api/resolve-audio` | invitado permitido | namespace `landing-demo`; devuelve `audio_url`, `voice_name`, `from_cache` sin generar |
| `POST /api/synthesize-speech` | invitado permitido | mismo namespace; genera o recupera audio y devuelve el mismo contrato |
| `POST /api/resolve-image` | invitado permitido solo para `landing-demo` | identidad `category/deck/index/def_index/form`; devuelve `{ path }` sin generar |
| `POST /api/generate-image` | invitado permitido solo para `landing-demo` | prompt y contexto visual; devuelve `{ path }` |

Los adapters compartidos también implementan upload/delete para la app autenticada, pero esas
acciones no se exponen como controles del visitante en la landing.

## Flags y activación

- Cargo feature: — (solo frontend).
- Vite: `VITE_ENABLE_LANDING=true` (**opt-in**). Con landing activa, flashcards vive en `/flashcard`; sin ella, el módulo default toma `/`.
- Sparse: consultar con `./scripts/sparse-module.sh status`. Activar el perfil `landing` requiere
  autorización explícita del usuario y respaldo previo; nunca ejecutarlo automáticamente.
- Usuario ya autenticado en `/` → redirige a `/dashboard`.

## Dependencias con otros módulos

- **Kit `flashcardStudy`** (shell): el demo renderiza la MISMA tarjeta que el módulo flashcards — cambios visuales impactan a ambos (`client/CLAUDE.md` §4).
- **shell-auth** ([`shell-auth.md`](shell-auth.md)): login/redirects.
- Contratos compartidos en `client/src/contracts/` — nunca importar internals de `flashcards`.

## Datos

Ninguna colección propia. Feedback del demo → `/api/demo-feedback`.

## Cómo probar

```bash
# Solo lectura. Si landing no está en disco, solicitar autorización antes de cambiar el perfil.
./scripts/sparse-module.sh status
cd client && npm run dev        # http://localhost:5173/ sin login
npm test                        # incluye contratos landing-demo/media
```

### Matriz de cobertura automatizada

- `src/modules/landing/**/*.test.{js,jsx}`: feedback autenticado/invitado, borrador de retorno,
  idioma, navegación, prompt, carrusel, rating, sesión, swipe, completar y reiniciar el demo.
- `src/adapters/studyAdapters.test.js`: payloads y respuestas exactas de audio/imagen, errores,
  abortos y valores predeterminados.
- `src/services/httpClient.test.js`: JWT, métodos, serialización, upload y errores HTTP.
- Rust `feedback.rs`: límites Unicode, rating, orden, resumen, filtrado, fallback legacy y límite 50.
- Rust `generation.rs` + `dto/generation.rs`: límites, roles, defaults y deserialización de los
  payloads enviados por los adapters.
- `e2e/local-smoke.spec.js`: visitante real, navegación del demo, borrador hacia login y resolución
  invitada de assets versionados de audio/imagen a través del proxy local.
- `npm test` ejecuta también Vitest; `cargo test -p api_main --no-default-features --features
  auth,flashcards` cubre los handlers/use cases del perfil.
