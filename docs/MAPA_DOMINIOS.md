# Mapa de Dominios y Archivos del Proyecto (Foco de la IA)

Este documento es un **mapa de ruta** para la Inteligencia Artificial. Cuando el usuario indique: **"Toca [Nombre del Dominio]"**, la IA debe limitar su búsqueda, lectura y modificaciones de código estrictamente a los archivos definidos en ese dominio.

---

## 🗺️ Mapa de Relaciones: Dominio a Archivos

### 🎴 1. Decks & Flashcards (Gestión de Tarjetas y Categorías)
*Foco: Carga de JSONs locales, persistencia de tarjetas completadas y listado de vocabulario.*
*   **Backend (Rust):**
    *   [backend/src/domain/models/flashcard.rs](file:///home/jcoronado/Desktop/dev/flashcard/backend/src/domain/models/flashcard.rs) (Modelo)
    *   [backend/src/domain/repositories/db_repository.rs](file:///home/jcoronado/Desktop/dev/flashcard/backend/src/domain/repositories/db_repository.rs) (Método `CardProgressRepository`)
    *   [backend/src/application/use_cases/deck_use_cases.rs](file:///home/jcoronado/Desktop/dev/flashcard/backend/src/application/use_cases/deck_use_cases.rs) (Lógica)
    *   [backend/src/api/endpoints/decks.rs](file:///home/jcoronado/Desktop/dev/flashcard/backend/src/api/endpoints/decks.rs) (Endpoints)
*   **Frontend (React):**
    *   [client/src/repositories/flashcardRepository.js](file:///home/jcoronado/Desktop/dev/flashcard/client/src/repositories/flashcardRepository.js) (API)
    *   [client/src/context/FlashcardContext.jsx](file:///home/jcoronado/Desktop/dev/flashcard/client/src/context/FlashcardContext.jsx) (Estado Reactivo)
    *   [client/src/pages/FlashcardPage.jsx](file:///home/jcoronado/Desktop/dev/flashcard/client/src/pages/FlashcardPage.jsx) (Página/Vista)
    *   [client/src/pages/CoursePage.jsx](file:///home/jcoronado/Desktop/dev/flashcard/client/src/pages/CoursePage.jsx) (Selector de Decks)

---

### 🕹️ 2. Story Arcade (Modo Conversacional / Rol)
*Foco: Historial de la partida, progreso en la historia, episodios y lógica de juego.*
*   **Backend (Rust):**
    *   [backend/src/domain/models/story.rs](file:///home/jcoronado/Desktop/dev/flashcard/backend/src/domain/models/story.rs) (Modelo de Historia)
    *   [backend/src/domain/repositories/db_repository.rs](file:///home/jcoronado/Desktop/dev/flashcard/backend/src/domain/repositories/db_repository.rs) (Método `StoryArcadeRepository`)
    *   [backend/src/application/use_cases/story_use_cases.rs](file:///home/jcoronado/Desktop/dev/flashcard/backend/src/application/use_cases/story_use_cases.rs) (Lógica del Juego)
    *   [backend/src/api/endpoints/story_arcade.rs](file:///home/jcoronado/Desktop/dev/flashcard/backend/src/api/endpoints/story_arcade.rs) (Endpoints)
*   **Frontend (React):**
    *   [client/src/store/useGameStore.js](file:///home/jcoronado/Desktop/dev/flashcard/client/src/store/useGameStore.js) (Estado con Zustand)
    *   [client/src/pages/StoryArcadePage.jsx](file:///home/jcoronado/Desktop/dev/flashcard/client/src/pages/StoryArcadePage.jsx) (Pantalla del juego)
    *   [client/src/pages/StoryArcade.css](file:///home/jcoronado/Desktop/dev/flashcard/client/src/pages/StoryArcade.css) (Estilos del juego)

---

### 🧠 3. Tutor IA (Gemini API / Análisis de Errores)
*Foco: LLM de Gemini, prompts de análisis de errores de usuario, explicaciones cortas.*
*   **Backend (Rust):**
    *   [backend/src/domain/repositories/tutor.rs](file:///home/jcoronado/Desktop/dev/flashcard/backend/src/domain/repositories/tutor.rs) (Interfaz del Tutor)
    *   [backend/src/infrastructure/ai/gemini_grpc_provider.rs](file:///home/jcoronado/Desktop/dev/flashcard/backend/src/infrastructure/ai/gemini_grpc_provider.rs) (Adaptador gRPC Gemini)
    *   [backend/src/application/use_cases/tutor_use_cases.rs](file:///home/jcoronado/Desktop/dev/flashcard/backend/src/application/use_cases/tutor_use_cases.rs) (Lógica de Tutoría)
    *   [backend/src/api/endpoints/tutor.rs](file:///home/jcoronado/Desktop/dev/flashcard/backend/src/api/endpoints/tutor.rs) (Endpoints)
*   **Frontend (React):**
    *   [client/src/repositories/tutorRepository.js](file:///home/jcoronado/Desktop/dev/flashcard/client/src/repositories/tutorRepository.js) (API)
    *   [client/src/pages/GrammarPage.jsx](file:///home/jcoronado/Desktop/dev/flashcard/client/src/pages/GrammarPage.jsx) (Historial de errores)

---

### 🔊 4. Audio & Phonics (Generación de Voz por TTS)
*Foco: Sintetizador de voz Google Cloud Text-to-Speech.*
*   **Backend (Rust):**
    *   [backend/src/domain/repositories/audio.rs](file:///home/jcoronado/Desktop/dev/flashcard/backend/src/domain/repositories/audio.rs) (Interfaz de Audio)
    *   [backend/src/infrastructure/ai/tts_grpc_provider.rs](file:///home/jcoronado/Desktop/dev/flashcard/backend/src/infrastructure/ai/tts_grpc_provider.rs) (Adaptador gRPC TTS)
    *   [backend/src/application/use_cases/audio_use_cases.rs](file:///home/jcoronado/Desktop/dev/flashcard/backend/src/application/use_cases/audio_use_cases.rs) (Lógica)
    *   [backend/src/api/endpoints/generation.rs](file:///home/jcoronado/Desktop/dev/flashcard/backend/src/api/endpoints/generation.rs) (Endpoints comunes de generación)
*   **Frontend (React):**
    *   [client/src/repositories/audioRepository.js](file:///home/jcoronado/Desktop/dev/flashcard/client/src/repositories/audioRepository.js) (API)

---

### 🖼️ 5. Imágenes (ComfyUI / FLUX)
*Foco: Generación y vinculación de imágenes para flashcards.*
*   **Backend (Rust):**
    *   [backend/src/domain/repositories/image.rs](file:///home/jcoronado/Desktop/dev/flashcard/backend/src/domain/repositories/image.rs) (Interfaz)
    *   [backend/src/infrastructure/ai/comfy_provider.rs](file:///home/jcoronado/Desktop/dev/flashcard/backend/src/infrastructure/ai/comfy_provider.rs) (Adaptador HTTP ComfyUI)
    *   [backend/src/application/use_cases/image_use_cases.rs](file:///home/jcoronado/Desktop/dev/flashcard/backend/src/application/use_cases/image_use_cases.rs) (Lógica)
    *   [backend/src/api/endpoints/generation.rs](file:///home/jcoronado/Desktop/dev/flashcard/backend/src/api/endpoints/generation.rs) (Endpoints comunes de generación)
*   **Frontend (React):**
    *   [client/src/repositories/imageRepository.js](file:///home/jcoronado/Desktop/dev/flashcard/client/src/repositories/imageRepository.js) (API)

---

### 🔑 6. Autenticación & Usuarios (Google OAuth / Presencia)
*Foco: Logins de usuario, perfiles de sesión Google, tokens JWT y heartbeats de presencia activa.*
*   **Backend (Rust):**
    *   [backend/src/domain/models/user.rs](file:///home/jcoronado/Desktop/dev/flashcard/backend/src/domain/models/user.rs) (Modelo)
    *   [backend/src/application/use_cases/auth.rs](file:///home/jcoronado/Desktop/dev/flashcard/backend/src/application/use_cases/auth.rs) (Lógica de autenticación)
    *   [backend/src/application/use_cases/presence_use_cases.rs](file:///home/jcoronado/Desktop/dev/flashcard/backend/src/application/use_cases/presence_use_cases.rs) (Presencia activa)
    *   [backend/src/api/middleware/mod.rs](file:///home/jcoronado/Desktop/dev/flashcard/backend/src/api/middleware/mod.rs) (Middleware de verificación de JWT)
    *   [backend/src/api/endpoints/auth.rs](file:///home/jcoronado/Desktop/dev/flashcard/backend/src/api/endpoints/auth.rs) y [presence.rs](file:///home/jcoronado/Desktop/dev/flashcard/backend/src/api/endpoints/presence.rs) (Endpoints)
*   **Frontend (React):**
    *   [client/src/repositories/AuthRepository.js](file:///home/jcoronado/Desktop/dev/flashcard/client/src/repositories/AuthRepository.js) (API)
    *   [client/src/context/AuthContext.jsx](file:///home/jcoronado/Desktop/dev/flashcard/client/src/context/AuthContext.jsx) (Context de Autenticación)
    *   [client/src/services/httpClient.js](file:///home/jcoronado/Desktop/dev/flashcard/client/src/services/httpClient.js) (Interceptor de red para JWT)
    *   [client/src/pages/LoginPage.jsx](file:///home/jcoronado/Desktop/dev/flashcard/client/src/pages/LoginPage.jsx) (Página de Login)

---

### 💳 7. Suscripciones & Pagos (Premium)
*Foco: Gestión de planes Premium de SurrealDB y pasarela de pago Stripe (o manual por admin).*
*   **Backend (Rust):**
    *   [backend/src/domain/repositories/payment.rs](file:///home/jcoronado/Desktop/dev/flashcard/backend/src/domain/repositories/payment.rs) (Interfaz Stripe/Null)
    *   [backend/src/application/use_cases/subscription_use_cases.rs](file:///home/jcoronado/Desktop/dev/flashcard/backend/src/application/use_cases/subscription_use_cases.rs) (Lógica)
    *   [backend/src/api/endpoints/admin.rs](file:///home/jcoronado/Desktop/dev/flashcard/backend/src/api/endpoints/admin.rs) (Endpoints de administración de suscripciones)
*   **Frontend (React):**
    *   [client/src/repositories/adminRepository.js](file:///home/jcoronado/Desktop/dev/flashcard/client/src/repositories/adminRepository.js) (API)
    *   [client/src/pages/AdminPage.jsx](file:///home/jcoronado/Desktop/dev/flashcard/client/src/pages/AdminPage.jsx) (Panel administrativo)

---

### 🛠️ 8. Infraestructura, Despliegue & Pipelines
*Foco: Caddy, balanceo, scripts de inicio, docker-compose, CI/CD.*
*   [INFRASTRUCTURE.md](file:///home/jcoronado/Desktop/dev/flashcard/INFRASTRUCTURE.md) (Estrategia física)
*   [azure-pipelines.yml](file:///home/jcoronado/Desktop/dev/flashcard/azure-pipelines.yml) (Pipeline de DevOps)
*   [start.sh](file:///home/jcoronado/Desktop/dev/flashcard/start.sh) (Arranque local)
*   [docker-compose.yml](file:///home/jcoronado/Desktop/dev/flashcard/docker-compose.yml) (Base de datos local)
