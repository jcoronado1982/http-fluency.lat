# Módulo `pronoun` — Referencia y práctica guiada de pronombres

> ⚠️ **Puede no estar en disco**: el perfil sparse actual (`dev-flashcards`) excluye
> `backend/mod_pronoun/` y `client/src/modules/pronounPractice/`. Para trabajarlo:
> `./scripts/sparse-module.sh pronoun`. Su ausencia es intencional, no un error.

## Propósito

Referencia gramatical de pronombres (`CoursePage`) y práctica guiada narrativa (`PracticePage`):
historias por episodios/pantallas donde el usuario practica y el tutor IA analiza sus errores.

## Estado y roadmap

- Estado: **activo** (rama de trabajo: `dev-pronoun`).
- Degradación conocida: sin SurrealDB, el progreso cae a SQLite efímero.

## Mapa de archivos

| Capa | Ruta | Qué contiene |
|---|---|---|
| Dominio | `backend/core/src/domain/models/story.rs` | historias/episodios |
| Puerto DB | `backend/core/src/ports/db_repository.rs` | `PronounPracticeRepository` |
| Casos de uso | `backend/mod_pronoun/src/lib.rs` | `StoryUseCases` (crate `pronoun_practice`) |
| Registro rutas | `backend/api_main/src/modules/pronoun_practice.rs` | endpoints del módulo |
| Handlers | `backend/api_main/src/api/endpoints/pronoun_practice.rs` | handlers HTTP |
| Frontend | `client/src/modules/pronounPractice/` | manifiesto, `CoursePage.jsx` (referencia), `PracticePage.jsx` (orquestador) |
| Wiring | `client/src/modules/pronounPractice/composition.js` | storyPort + tutorPort |
| Queries | `client/src/modules/pronounPractice/queries/storyQueries.js` | React Query |
| Sesión | `client/src/modules/pronounPractice/hooks/useStorySession.js` | lógica de sesión |
| Datos estáticos | `client/src/modules/pronounPractice/domain/pronounReferenceData.js` | tabla de referencia |
| UI práctica | `client/src/modules/pronounPractice/features/practice/` | subcomponentes |
| Seed | `infra/seed/pronoun_practice_seed.surql` + `infra/proxy/seed-pronoun-practice.sh` | precarga de historias (start.sh lo ejecuta si el perfil tiene el flag) |

## Contratos / endpoints

Registrados en `backend/api_main/src/modules/pronoun_practice.rs` (feature `pronoun_practice`);
handlers y DTOs en `api_main/src/api/endpoints/pronoun_practice.rs`:

| Método | Ruta | Qué hace |
|---|---|---|
| GET | `/api/progress` | progreso del usuario en historias |
| POST | `/api/progress/update` | actualiza progreso |
| POST | `/api/progress/reset` | resetea progreso |
| GET | `/api/episodes/:episode_id/screens` | pantallas de un episodio |
| GET | `/api/episodes/:episode_id/next` | siguiente pantalla |
| GET | `/api/stories/:story_id/full-history` | historia completa |

El tutor (`/api/analyze-error`, `/api/explain-like-child`) es del shell, no de este módulo.

## Flags y activación

- Cargo feature: `pronoun_practice`. Build: `cargo build -p api_main --no-default-features --features auth,pronoun_practice`.
- Vite: `VITE_ENABLE_PRONOUN_REFERENCE` (opt-out) + `VITE_ENABLE_PRONOUN_PRACTICE` (opt-in). Ruta `/pronoun-practice`.
- Sparse: `./scripts/sparse-module.sh pronoun`.

## Dependencias con otros módulos

- **shell-auth** ([`shell-auth.md`](shell-auth.md)): JWT y tutor IA (`tutorPort` → `adapters/tutorHttpAdapter.js`).
- Ninguna con flashcards/landing/pricing.

## Datos

SurrealDB: `stories`, `episodes`, `story_screens`, `user_progress`, `user_errors`
(namespace del "Motor Arcade"). Ver [`database_schema_diagram.md`](../../database_schema_diagram.md).

## Cómo probar

```bash
./scripts/sparse-module.sh pronoun
./start.sh          # detecta el flag pronoun y ejecuta el seed automáticamente
# UI: http://localhost:5173/pronoun-practice
./scripts/validate-module.sh pronoun
```
