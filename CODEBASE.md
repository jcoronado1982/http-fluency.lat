# CODEBASE.md — Flashcard AI

> Referencia técnica detallada de la estructura de código, componentes y tecnologías del proyecto.

---

## Estructura del Repositorio

```
flashcard/
├── backend/          ← API REST y servicios en Rust
├── client/           ← SPA y frontend en React
├── infra/
│   └── proxy/        ← Configuración de Caddy, Docker y scripts de balanceo
├── json/             ← Contenido de las flashcards en formato JSON (sincronizados a Oracle)
└── docs/             ← Documentación de arquitectura e infraestructura
```

---

## Backend — `backend/`

### Tecnologías Principales: Rust + Axum

*   **Rust:** Elegido por su bajísimo consumo de recursos (~20 MB RAM en idle), excelente rendimiento (sin recolector de basura) y seguridad en tiempo de compilación.
*   **Axum:** Framework HTTP asíncrono construido sobre Tokio, hiper-eficiente para el enrutamiento y manejo de JSON.

### Arquitectura de Código

Sigue los principios de **Clean Architecture (Puertos y Adaptadores)** y **SOLID**:

```
backend/src/
├── config.rs                    ← Carga de variables de entorno y configuraciones
├── main.rs                      ← Composición de dependencias (Composition Root) y arranque
├── domain/
│   ├── models/                  ← Modelos puros del dominio (flashcard, user, subscription, story)
│   └── repositories/            ← Puertos (Traits en Rust) para interacción con el exterior
├── application/
│   └── use_cases/               ← Lógica de negocio (orquestadores de casos de uso)
├── infrastructure/
│   ├── storage/                 ← Adaptadores concretos: local/SCP (local_repository) y SurrealDB (surreal_repository)
│   └── ai/                      ← Proveedores de IA: Gemini (tutor) y Google TTS (audio)
└── api/
    ├── middleware/              ← Filtros/guards de seguridad (validación de JWT claims)
    └── endpoints/               ← Rutas y handlers HTTP de Axum
```

### Base de Datos Activa: SurrealDB

El sistema utiliza **SurrealDB** como base de datos en AWS para gestionar la persistencia avanzada:
*   **Usuarios (`users`):** Guarda perfil de Google y permisos.
*   **Suscripciones (`subscription`):** Controla el estado Premium (`active`/`cancelled`/`expired`) y fechas de vencimiento.
*   **Progreso de Tarjetas (`card_progress`):** Registro de qué tarjetas ha completado cada usuario.
*   **Motor Arcade:** Tablas `stories`, `episodes`, `story_screens`, `user_progress` y `user_errors` para la lógica narrativa y tutoría de errores.

#### Degradación Elegante (*Null Object*)
Si SurrealDB está desconectado (por ejemplo, en el entorno efímero de Google Cloud Run), el sistema inyecta automáticamente un [null_db_repository.rs](file:///home/jcoronado/Desktop/dev/flashcard/backend/src/infrastructure/storage/null_db_repository.rs). Esto permite al usuario seguir estudiando las tarjetas (las cuales se leen y guardan vía JSON), inhabilitando de forma controlada únicamente el inicio de sesión y el modo Arcade.

---

## Frontend — `client/`

### Tecnologías: React 19 + Vite + Tailwind CSS

*   **React:** SPA (Single Page Application) servida estáticamente, con renderizado visual rápido.
*   **Vite:** Herramienta de compilación ultrarrápida que optimiza el empaquetado de producción.
*   **Tailwind CSS:** Diseño responsivo modular por clases de utilidad.

### Estructura de Código

El frontend replica la separación de responsabilidades y modularidad limpia:

```
client/src/
├── main.jsx              ← Punto de montaje inicial del DOM y enrutadores
├── App.jsx               ← Definición de rutas del cliente (react-router-dom)
├── services/
│   └── httpClient.js     ← Único interceptor de red: inyecta JWT y maneja códigos HTTP
├── repositories/         ← Contratos de API aislados (flashcardRepository, authRepository, etc.)
├── context/              ← Estado reactivo de los proveedores (AuthContext, FlashcardContext)
├── features/             ← Módulos de funcionalidad orientados a dominio (flashcards, story-arcade, phonics)
├── components/           ← Elementos genéricos y tontos de UI
└── store/                ← Stores para gestión de estado (Zustand para useGameStore)
```

---

## Sincronización de Archivos y Assets (SCP a Oracle)

La aplicación almacena archivos (JSONs de barajas, audio sintetizado `.ogg` e imágenes generadas por IA) de manera centralizada y persistente en el proxy de **Oracle Cloud**.

### Flujo de Sincronización
El backend soporta dos configuraciones controladas por la variable `SYNC_TO_ORACLE`:

*   **En desarrollo (`SYNC_TO_ORACLE=false`):** Los archivos se leen y escriben localmente en el disco de desarrollo.
*   **En producción (`SYNC_TO_ORACLE=true`):**
    *   **Lectura:** El backend realiza peticiones directas al balanceador Caddy (`https://fluency.lat/json/...`).
    *   **Escritura:** El backend genera el archivo temporalmente en disco local (`/tmp`), lo transfiere de forma segura mediante SCP a Oracle utilizando `sshpass` y variables de entorno, y finalmente elimina el archivo temporal.

---

## Variables de Entorno Requeridas en Producción

| Variable | Requerido | Descripción |
|---|---|---|
| `JWT_SECRET` | Sí | Secreto para firmar y validar tokens de sesión JWT |
| `GOOGLE_CLIENT_ID` | Sí | Identificador para la autenticación de Google OAuth |
| `SUPER_ADMIN_EMAIL` | Sí | Correo electrónico con privilegios de administrador automático |
| `GCP_API_KEY` | Sí | Llave de Google Cloud con accesos a la API Text-to-Speech |
| `GEMINI_API_KEY` | Sí | Llave para habilitar el tutor y explicaciones de Gemini 2.0 |
| `GEMINI_TTS_API_KEY` | Sí (audio EN) | Clave primaria Google AI Studio para Gemini TTS (inglés) |
| `GEMINI_TTS_API_KEY_BACKUP` | Solo local batch | Respaldo en `backend/.env` para `--batch-gen-audio`; **no** se usa en producción |
| `SYNC_TO_ORACLE` | Sí | Habilita la copia remota mediante SCP (`true` en producción) |
| `ORACLE_HOST` | Sí | Dirección IP pública de la máquina proxy de Oracle |
| `ORACLE_SSH_PASSWORD` | Sí | Contraseña de acceso SSH seguro para realizar transferencias SCP |
| `ORACLE_REMOTE_PATH` | Sí | Ruta destino en Oracle (`/root/smart-proxy/repository/flashcard`) |
| `LOCAL_STORAGE_PATH` | Sí | Directorio temporal del backend para generación de archivos (`/tmp`) |
| `SURREAL_URL` | Sí | Dirección de conexión a la base de datos SurrealDB en AWS |
