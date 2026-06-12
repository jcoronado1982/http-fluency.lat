# Diagrama del Modelo de Datos (Esquema de Base de Datos)

Este documento detalla la estructura lógica de las tablas/colecciones de la base de datos de **Flashcard AI** (SurrealDB) y cómo se relacionan entre sí para dar soporte al aprendizaje de vocabulario y al modo conversacional Story Arcade.

## Diagrama Entidad-Relación (Mermaid)

El siguiente diagrama muestra las colecciones y sus relaciones lógicas. Las tablas `subscription` y `card_progress` se relacionan con `user` mediante el email o identificador de usuario. Las tablas de historias (`stories`, `episodes`, `story_screens`) estructuran la jerarquía narrativa del juego de rol.

```mermaid
erDiagram
    user {
        string id PK
        string email UNIQUE
        string name
        string picture
        string role
        datetime created_at
        datetime last_login
    }

    subscription {
        string user_email PK
        string plan
        string status
        datetime starts_at
        datetime expires_at
        string payment_provider
        string external_customer_id
        string external_subscription_id
        datetime created_at
        datetime updated_at
    }

    card_progress {
        string id PK
        string user_id FK
        string category
        string deck
        int card_index
        bool learned
        datetime learned_at
    }

    stories {
        int id PK
        string title
        string level
        int order_sequence
        datetime created_at
    }

    episodes {
        int id PK
        int story_id FK
        int episode_number
        string title
        datetime created_at
    }

    story_screens {
        int id PK
        int episode_id FK
        int step_order
        json content
        datetime created_at
    }

    user_progress {
        string id PK
        string user_id FK
        int story_id FK
        int current_episode_id FK
        int current_step_order
        int total_score
        string status
        datetime last_updated
    }

    user_errors {
        string id PK
        string user_id FK
        int story_id FK
        int screen_id FK
        string user_input
        string correct_answer
        string error_type
        string explanation
        datetime created_at
    }

    %% Relaciones Lógicas
    user ||--o| subscription : "tiene 0 o 1"
    user ||--o{ card_progress : "registra avance de"
    user ||--o{ user_progress : "tiene avance en"
    user ||--o{ user_errors : "comete"

    stories ||--o{ episodes : "se divide en"
    episodes ||--o{ story_screens : "contiene pantallas"
    stories ||--o{ user_progress : "mide avance de"
    episodes ||--o{ user_progress : "esta en el capitulo"
    story_screens ||--o{ user_errors : "ocurre en pantalla"
    stories ||--o{ user_errors : "ocurre en historia"
```

---

## Detalle de las Tablas en SurrealDB

En SurrealDB, la persistencia se organiza mediante registros orientados a documentos altamente relacionados:

### 1. Gestión de Usuarios y Permisos
*   **`user`** (ID: `user:<email>`): Almacena la información recuperada de Google OAuth. El rol (`role`) determina el nivel de acceso (por ejemplo, `viewer`, `premium` o `admin`).
*   **`subscription`** (ID: `subscription:<email>`): Almacena el estado activo, expirado o cancelado de los planes de facturación vinculados al correo electrónico del usuario.

### 2. Progreso de Flashcards
*   **`card_progress`**: Registra qué tarjetas específicas han sido marcadas como aprendidas (`learned: true`) por cada usuario dentro de una categoría y baraja (`deck`) proveniente de los JSONs.

### 3. Motor de Story Arcade (Juego de Rol)
*   **`stories`**: Historias de aventuras disponibles para practicar inglés.
*   **`episodes`**: Episodios o capítulos secuenciales que pertenecen a cada historia.
*   **`story_screens`**: Pantallas de texto interactivo con retos de traducción y soporte de imágenes/audio de apoyo.
*   **`user_progress`**: Estado de avance de un jugador, incluyendo su puntuación global, el ID del episodio donde se encuentra y la pantalla actual.
*   **`user_errors`**: Bitácora de errores gramaticales detectados por Gemini. Guarda la entrada incorrecta del usuario y la explicación correctiva facilitada por la IA para su posterior consulta y repaso.
