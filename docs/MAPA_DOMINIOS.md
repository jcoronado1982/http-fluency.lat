# Mapa de Dominios y Archivos del Proyecto

Mapa de ruta para IA y desarrolladores. Antes de editar un dominio, consulta también [docs/ARQUITECTURA_MODULAR.md](ARQUITECTURA_MODULAR.md) y usa sparse-checkout si solo necesitas un módulo:

```bash
./scripts/sparse-module.sh flashcards   # o pronoun
```

---

## Módulos de negocio (registry)

| Registry ID | Sparse | Backend | Frontend |
|-------------|--------|---------|----------|
| `flashcards` | `./scripts/sparse-module.sh flashcards` | `backend/mod_flashcards`, rutas en `api_main/src/modules/flashcards.rs` | `client/src/modules/flashcards/` |
| `pronoun` | `./scripts/sparse-module.sh pronoun` | `backend/mod_pronoun` (crate `pronoun_practice`), `api_main/src/modules/pronoun_practice.rs` | `client/src/modules/pronounPractice/` |

Shell compartido: `backend/core`, `backend/api_main`, `client/src/modules/index.js`, layout, auth.
Casos de uso compartidos del shell: `backend/mod_shell`.

---

## Dominios funcionales → archivos

### Flashcards (módulo `flashcards`)

**Backend**
- `backend/core/src/domain/models/flashcard.rs`
- `backend/core/src/ports/db_repository.rs` (`CardProgressRepository`)
- `backend/mod_flashcards/src/lib.rs` (`DeckUseCases`)
- `backend/mod_flashcards/src/audio_use_cases.rs`
- `backend/mod_flashcards/src/image_use_cases.rs`
- `backend/api_main/src/api/endpoints/decks.rs`
- `backend/api_main/src/api/endpoints/generation.rs` (feature `flashcards`)
- `backend/api_main/src/modules/flashcards.rs`

**Frontend**
- `client/src/modules/flashcards/` — index, page, context, **ports/**, **adapters/**, **useCases/**, **composition.js**, **config/** (`catalogOrder`, `translations`), componentes UI
- `client/src/config/api.js` — re-export shell (`API_URL`, `AI_ENABLED`)

---

### Pronombres / práctica guiada (módulo `pronoun`)

**Backend**
- `backend/core/src/domain/models/story.rs`
- `backend/core/src/ports/db_repository.rs` (`PronounPracticeRepository`)
- `backend/mod_pronoun/src/lib.rs` (`StoryUseCases`)
- `backend/api_main/src/api/endpoints/pronoun_practice.rs`
- `backend/api_main/src/modules/pronoun_practice.rs`

**Frontend**
- `client/src/modules/pronounPractice/`
- `client/src/modules/pronounPractice/composition.js` — wiring storyPort + tutorPort
- `client/src/modules/pronounPractice/queries/storyQueries.js` — React Query
- `client/src/modules/pronounPractice/domain/pronounReferenceData.js` — tabla de referencia
- `client/src/modules/pronounPractice/CoursePage.jsx` — referencia
- `client/src/modules/pronounPractice/PracticePage.jsx` — práctica guiada (orquestador)
- `client/src/modules/pronounPractice/hooks/useStorySession.js` — lógica de sesión
- `client/src/modules/pronounPractice/features/practice/` — subcomponentes UI

---

### Tutor IA (shell)

- `backend/core/src/ports/tutor.rs`
- `backend/api_main/src/infrastructure/ai/gemini_grpc_provider.rs`
- `backend/mod_shell/src/tutor_use_cases.rs`
- `backend/api_main/src/api/endpoints/tutor.rs`
- `client/src/modules/pronounPractice/adapters/tutorHttpAdapter.js` (consumido vía `tutorPort`)

---

### Audio e imágenes (módulo flashcards)

- `backend/mod_flashcards/src/audio_use_cases.rs`
- `backend/mod_flashcards/src/image_use_cases.rs`
- `client/src/modules/flashcards/adapters/audioHttpAdapter.js`
- `client/src/modules/flashcards/adapters/imageHttpAdapter.js`

---

### Auth y usuarios (shell, feature `auth`)

- `backend/core/src/domain/models/user.rs`
- `backend/mod_shell/src/auth.rs`
- `backend/api_main/src/api/endpoints/auth.rs`
- `client/src/context/AuthContext.jsx`
- `client/src/pages/LoginPage.jsx`

---

### Suscripciones (shell, feature `subscriptions`)

- `backend/mod_shell/src/subscription_use_cases.rs`
- `backend/api_main/src/api/endpoints/admin.rs`
- `client/src/pages/AdminPage.jsx`

---

### Infraestructura

- `INFRASTRUCTURE.md`
- `docs/infrastructure/pipeline-and-deploy.md`
- `azure-pipelines.yml`, `start.sh`, `docker-compose.yml`
