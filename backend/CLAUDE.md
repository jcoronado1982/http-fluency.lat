# Backend — Fluency (backend/)

> **Documentación exclusiva del backend Rust.** Frontend: `client/CLAUDE.md`. Protocolo general
> e índice: `CLAUDE.md` (raíz). Módulo concreto: `docs/modules/<módulo>.md`.

Workspace Rust (Axum + Tokio) con arquitectura **Clean/Hexagonal y monolito modular**: el dominio
no conoce la infraestructura; los módulos de negocio se activan por Cargo features.

## Estructura del workspace

```
backend/
├── core/            ← fluency_core: dominio (models/) + puertos (ports/) — SIN dependencias de infra
├── mod_shell/       ← casos de uso del shell: auth (OAuth→JWT), tutor, presence, subscriptions, daily_stats
├── mod_flashcards/  ← DeckUseCases + audio/image use cases + batch  (feature `flashcards`)
├── mod_pronoun/     ← StoryUseCases (crate `pronoun_practice`; ausente en sparse dev-flashcards)
└── api_main/        ← composition root:
    ├── src/main.rs             wiring de adapters + rutas del shell
    ├── src/config.rs           Settings (env vars)
    ├── src/modules/            registro de rutas POR módulo (flashcards.rs, pronoun_practice.rs, shell.rs)
    ├── src/api/endpoints/      handlers HTTP (delgados: mapean HTTP ↔ use cases)
    └── src/infrastructure/     adapters: SurrealDB, storage, media_delivery, ai/ (Gemini gRPC, TTS, ComfyUI, AVIF)
```

**Regla de dependencias (inviolable)**: `core` no importa de nadie; `mod_*` importa solo `core`;
`api_main` importa todo y cablea. Un `mod_*` jamás importa de `api_main` ni de otro `mod_*`.

## Cargo features (módulos enchufables)

| Feature | Activa |
|---|---|
| `flashcards` (default) | mod_flashcards + endpoints decks/generation |
| `pronoun_practice` | mod_pronoun + endpoints de práctica |
| `auth` | login OAuth/JWT, presencia, endpoints admin |
| `subscriptions` | suscripciones |
| `payments` | (futuro, sin desarrollar) |

```bash
cargo build -p api_main                                                    # default
cargo build -p api_main --no-default-features --features auth,flashcards   # solo flashcards
cargo check -p api_main    # SIEMPRE antes de push (protocolo del pipeline)
```

## Receta: añadir un endpoint a un módulo

1. Lógica en el crate del módulo (`mod_<x>/src/…`) como caso de uso — nunca en el handler.
2. Si necesita infra nueva: definir el **puerto** en `core/src/ports/`, implementar el **adapter**
   en `api_main/src/infrastructure/`, cablear en `main.rs` (AppState solo expone use cases).
3. Handler delgado en `api_main/src/api/endpoints/<x>.rs`.
4. Registrar la ruta en `api_main/src/modules/<x>.rs` (no en `main.rs`, salvo rutas del shell).
5. Compilar con la feature activada Y desactivada: nada debe romperse sin el módulo.
6. **Cerrar el trabajo**: documentar el endpoint (entrada exacta, respuesta, invariantes) en
   `docs/modules/<módulo>.md` y correr `./scripts/verify-blueprints.sh` — falla si la ruta no
   está en el plano (regla de cierre de `CLAUDE.md` raíz).

## Persistencia y degradación

- **SurrealDB 1.5.5** vía WS (`SURREAL_URL`; en prod `10.0.1.138:8080` por VCN privada).
  Quirks 1.5.5: funciones string en camelCase (`string::startsWith`), índices de UN solo campo,
  transacciones multi-statement en una sola query. Watchdog de reconexión cada 30 s.
- Sin DB → `infrastructure/storage/null_db_repository.rs` (Null Object, la app arranca igual).
- Assets (json/audio/imágenes): disco local en prod (`SYNC_TO_ORACLE=false`,
  `ORACLE_REPOSITORY_ONLY=false` — ⚠️ el default del binario es `true` y rompe los lookups por
  prefijo). Env vars completas: tabla en `CODEBASE.md`.

## Cómo probar

```bash
./start.sh                    # stack completo (DB Docker + ComfyUI + backend :8081 + Vite :5173)
cargo check -p api_main       # gate mínimo
curl -s http://localhost:8081/api/health
curl -X POST http://127.0.0.1:5173/api/auth/dev-guest   # JWT dev sin OAuth
```

Restricciones de producción (RAM 1 GB, prohibido cachear bytes de media, límites Docker):
**leer `docs/infrastructure/AI_OPERATIONS_CONTEXT.md` antes de cualquier cambio de rendimiento.**
