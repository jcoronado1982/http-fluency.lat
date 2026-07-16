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
| Audio demo | `card_audio/landing-demo/` (157 audios) | copiados por el pipeline en cada deploy |

## Contratos / endpoints

Sin endpoints propios. El demo usa `resolve-audio`/`resolve-image`/`synthesize-speech` de
flashcards con el namespace `landing-demo` (el backend enruta el proveedor TTS por categoría).

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
