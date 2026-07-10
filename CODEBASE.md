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

Monolito modular Clean/Hexagonal. Ver [ARQUITECTURA_MODULAR.md](docs/ARQUITECTURA_MODULAR.md).

```
backend/
├── core/                        ← fluency_core: dominio + puertos
├── mod_shell/                   ← auth, tutor, presence, subscriptions
├── mod_flashcards/              ← DeckUseCases + audio/image use cases
├── mod_pronoun/                 ← StoryUseCases (crate pronoun_practice)
└── api_main/
    ├── src/main.rs              ← composition root
    ├── src/modules/             ← registro de rutas por módulo
    ├── src/infrastructure/      ← adapters Surreal, Gemini, ComfyUI
    └── src/api/endpoints/       ← handlers HTTP
```

### Base de Datos Activa: SurrealDB

El sistema utiliza **SurrealDB 1.5.5** (RocksDB) alojado en **server-oci-1** (Oracle Cloud, VCN privada `10.0.1.138:8080`) para gestionar la persistencia avanzada:
*   **Usuarios (`users`):** Guarda perfil de Google y permisos.
*   **Suscripciones (`subscription`):** Controla el estado Premium (`active`/`cancelled`/`expired`) y fechas de vencimiento.
*   **Progreso de Tarjetas (`card_progress`):** Registro de qué tarjetas ha completado cada usuario.
*   **Motor Arcade:** Tablas `stories`, `episodes`, `story_screens`, `user_progress` y `user_errors` para la lógica narrativa y tutoría de errores.

#### Degradación Elegante (*Null Object*)
Si SurrealDB está desconectado, el sistema inyecta `backend/api_main/src/infrastructure/storage/null_db_repository.rs`.

---

## Frontend — `client/`

### Tecnologías: React 19 + Vite + CSS propio modular

*   **React:** SPA (Single Page Application) servida estáticamente, con renderizado visual rápido.
*   **Vite:** Herramienta de compilación ultrarrápida que optimiza el empaquetado de producción.
*   **CSS propio modular:** Base global + CSS por página/módulo + CSS Modules en componentes aislados.

### Estructura de Código

El frontend replica la separación de responsabilidades y modularidad limpia:

```
client/src/
├── main.jsx
├── App.jsx               ← shell: layout + getAppRoutes (sin imports de módulos)
├── modules/
│   ├── index.js          ← registry loader
│   ├── flashcards/       ← módulo flashcards completo (UI + repos + servicios)
│   └── pronounPractice/  ← módulo pronoun
├── context/              ← shell: UIContext, AuthContext
└── services/httpClient.js
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
