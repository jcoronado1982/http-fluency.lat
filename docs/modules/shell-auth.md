# Shell compartido y autenticación (`mod_shell` + `core` + registry frontend)

## Propósito

El shell es la base que siempre se entrega con cualquier combinación de módulos: dominio y
puertos (`core`), autenticación Google OAuth→JWT, tutor IA, presencia, suscripciones, experiencia
PWA online-first y el registry/layout del frontend. **No es un módulo de negocio**: es lo que los
módulos enchufan.

## Estado y roadmap

- Estado: **activo** (siempre presente; el sparse-checkout nunca lo excluye).
- Pagos/checkout transaccional: previsto sobre Postgres, **sin desarrollar** (ver [`pricing.md`](pricing.md)).

## Mapa de archivos

| Capa | Ruta | Qué contiene |
|---|---|---|
| Dominio + puertos | `backend/core/src/domain/`, `backend/core/src/ports/` | modelos (`user.rs`, `flashcard.rs`, `story.rs`), contratos (`db_repository.rs`, `tutor.rs`, `media_delivery.rs`) |
| Auth | `backend/mod_shell/src/auth.rs` | Google OAuth → JWT |
| Tutor IA | `backend/mod_shell/src/tutor_use_cases.rs` + `backend/api_main/src/infrastructure/ai/gemini_grpc_provider.rs` | análisis de errores, explicaciones (Gemini gRPC) |
| Presencia | `backend/mod_shell/src/presence_use_cases.rs` | heartbeat/leave |
| Suscripciones | `backend/mod_shell/src/subscription_use_cases.rs` | estado premium |
| Stats diarias | `backend/mod_shell/src/daily_stats_use_cases.rs` | métricas admin |
| Composition root | `backend/api_main/src/main.rs` | wiring de adapters + registro de rutas del shell |
| Rutas media estática | `backend/api_main/src/modules/shell.rs` | `/card_images/*`, `/card_audio/*` |
| Handlers | `backend/api_main/src/api/endpoints/` | `auth.rs`, `tutor.rs`, `presence.rs`, `health.rs`, `features.rs`, `notifications.rs`, `feedback.rs`, `assets.rs` |
| Adapters infra | `backend/api_main/src/infrastructure/` | SurrealDB, Gemini, ComfyUI, storage, media_delivery |
| Degradación DB | `backend/api_main/src/infrastructure/storage/null_db_repository.rs` | Null Object si Surreal cae |
| Registry frontend | `client/src/modules/index.js` + `routingPaths.js` | carga de manifiestos por flags |
| Auth frontend | `client/src/context/AuthContext.jsx`, `client/src/pages/LoginPage.jsx`, `client/src/repositories/` | sesión JWT en localStorage |
| HTTP | `client/src/services/httpClient.js` | único cliente HTTP (inyecta Bearer) |
| Layout/shell UI | `client/src/App.jsx`, `client/src/components/shell/`, `client/src/context/UIContext.jsx` | árbol de rutas bare vs app |
| PWA online-first | `client/public/manifest.webmanifest`, `client/public/sw.js`, `client/src/components/pwa/`, `client/public/pwa/` | identidad instalable, navegación network-only, instalación móvil y estado de conectividad |

## Contratos / endpoints (shell)

DTOs en `api_main/src/api/endpoints/auth.rs`:

| Método | Ruta | Auth | Entrada exacta | Qué hace |
|---|---|---|---|---|
| GET | `/api/health`, `/api/features` | no | — | salud y flags activos |
| POST | `/api/auth/google` | no | `{id_token}` (credential de Google) | login → JWT + user |
| POST | `/api/auth/apple` | no | `{id_token, name?}` | login Apple → JWT |
| POST | `/api/auth/dev-guest` | solo dev | — | JWT invitado admin (404 en prod) |
| GET | `/api/auth/me` | JWT | — | perfil actual |
| POST | `/api/auth/onboarding` | JWT | `{completed}` | marca onboarding |
| POST | `/api/auth/catalog-preferences` | JWT | `{catalog_preferences?}` | preferencias de catálogo |
| POST | `/api/auth/study-language` | JWT | `{study_language}` | dirección de curso |
| POST | `/api/analyze-error`, `/api/explain-like-child`, `/api/onboarding-guide` | JWT | ver `endpoints/tutor.rs` | tutor Gemini gRPC |
| POST | `/api/presence/heartbeat`, `/api/presence/leave` | JWT | — | presencia (consume admin) |
| GET | `/api/notifications/events` | JWT | — | SSE (excluido del timeout global) |
| GET/POST | `/api/demo-feedback` | GET no / POST JWT | — | feedback del demo |
| POST | `/api/local-agent/turn` | ⚠️ ver SECURITY.md | — | agente local (hallazgo de seguridad abierto) |
| GET | `/api/subscriptions/me` (feature `subscriptions`) | JWT | — | mi suscripción |
| GET | `/card_images/*`, `/card_audio/*` | no | path del asset | media estática versionada `?v=` |

Endpoints `/api/admin/*` (incl. `/api/admin/subscriptions` + `activate`/`cancel`): ver [`admin.md`](admin.md).

### Invariantes (no romper)

- El JWT viaja SIEMPRE como `Authorization: Bearer` inyectado por `httpClient.js` — ningún componente añade headers a mano.
- `SUPER_ADMIN_EMAIL` obtiene rol admin automáticamente al primer login.
- `dev-guest` debe responder 404 fuera de desarrollo (`dev_guest_token_allowed()`).
- Sin SurrealDB, auth degrada vía `NullDbRepository`: la app arranca, no explota.
- La PWA es **online-first**: el service worker delega las navegaciones directamente a la red y no
  usa Cache Storage. Tampoco intercepta `/api`, `/json`, `/card_images` o `/card_audio`; abrir otro
  mazo y obtener contenido nuevo requiere conexión.
- `PwaExperience` registra el service worker solo en builds de producción, muestra la pérdida de
  conectividad y permite descartar la sugerencia de instalación durante siete días. En iOS explica
  el flujo nativo Compartir → Añadir a pantalla de inicio.

## Flags y activación

- Cargo features: `auth` (login/presencia/admin), `subscriptions`. Siempre incluidos en los builds de producto.
- El shell frontend no tiene flag: siempre se carga; los módulos se activan con `VITE_ENABLE_*`.

## Dependencias con otros módulos

Ninguna (dirección inversa: los módulos dependen del shell, jamás al revés — regla inviolable).

## Datos

SurrealDB: `users`, `subscription`, presencia/actividad. Ver [`database_schema_diagram.md`](../../database_schema_diagram.md).

## Cómo probar

```bash
./start.sh
curl -X POST http://127.0.0.1:5173/api/auth/dev-guest    # JWT invitado admin en dev
curl -s http://localhost:8081/api/health
cd client && npm run test:routing                        # lógica pura de rutas del registry
cd client && npm run test:pwa                            # manifest, iconos y contrato network-only
cd client && npm run build                               # copia manifest.webmanifest + sw.js a dist
cd client && npm run preview:pwa                         # http://localhost:4173 + proxy backend :8081
# Google OAuth local: autorizar exactamente http://localhost:4173 como JavaScript origin.
# Comprobar instalación, registro del SW, login y aviso offline en Android/iOS.
```
