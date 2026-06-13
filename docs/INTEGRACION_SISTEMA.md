# Mapa de Integración e Interacción de Sistemas — Flashcard AI

Este documento sirve como plano maestro y referencia técnica para entender cómo interactúan entre sí los distintos componentes de **Flashcard AI** (Frontend, Backend, Proxy, Base de Datos y APIs de IA). Úsalo (y yo lo usaré) como guía principal para construir nuevos módulos sobre la marcha garantizando que se acoplen perfectamente al ecosistema del sistema.

---

## 1. Arquitectura de Interacción Global (Diagrama de Flujo)

El siguiente diagrama detalla la topología de red y el flujo de comunicación desde que el cliente interactúa con la UI hasta que los datos se persisten o procesan en los servicios de IA:

```mermaid
graph TD
    %% Clientes e Interfaces
    User([Usuario / Navegador]) <-->|HTTPS| Caddy[Caddy Proxy - Oracle Cloud]
    
    %% Capa de Proxy e Enrutamiento
    subgraph Oracle VM (Nodo Central)
        Caddy -->|Sirve estáticos| SPA[SPA React 19]
        Caddy -->|Proxy /api/*| RustBackend[Backend Rust / Axum]
        RustBackend <-->|Conexión Local / WebSockets| SurrealDB[(SurrealDB - local)]
    end

    %% Nodos Espejo y Fallback
    subgraph AWS EC2 / GCP (Respaldo)
        RustBackendFallback[Backend Rust Fallback]
        SurrealDBFallback[(SurrealDB Mirror)]
        RustBackendFallback <-->|WebSockets| SurrealDBFallback
    end

    %% Sincronización de Archivos
    RustBackendFallback -->|SCP / SYNC_TO_ORACLE=true| Caddy
    
    %% Proveedores de Servicios Externos (IA y APIs)
    subgraph Proveedores de Servicios / IA
        RustBackend -->|gRPC / Gemini API| Gemini[Gemini 3.1 Flash-Lite]
        RustBackend -->|gRPC / Cloud TTS| GoogleTTS[Google Cloud Text-to-Speech]
        RustBackend -->|HTTP / WebSockets| ComfyUI[ComfyUI + FLUX 2]
    end

    style Oracle VM fill:#e6f2ff,stroke:#0066cc,stroke-width:2px
    style AWS EC2 / GCP fill:#fff2e6,stroke:#ff8000,stroke-width:1px
    style Proveedores de Servicios / IA fill:#f2ffe6,stroke:#33cc33,stroke-width:2px
```

---

## 2. Ciclos de Vida de Solicitudes Clave (Lifecycles)

### A. Creación y Procesamiento de Tarjetas (Audio / Imagen por IA)
Cuando el usuario solicita generar recursos para una flashcard:
1. **Cliente (React):** Envía una solicitud HTTP `POST` a `/api/resolve-image` o `/api/synthesize-speech` mediante [httpClient.js](file:///home/jcoronado/Desktop/dev/flashcard/client/src/services/httpClient.js).
2. **Backend (Axum):** El enrutador en [main.rs](file:///home/jcoronado/Desktop/dev/flashcard/backend/src/main.rs) dirige la petición al handler en `/api/endpoints/generation.rs`.
3. **Casos de Uso (Application):** Se invoca `AudioUseCases` o `ImageUseCases`.
4. **Infraestructura (Providers):**
   - El backend llama a la API de **Google Cloud TTS** ([tts_grpc_provider.rs](file:///home/jcoronado/Desktop/dev/flashcard/backend/src/infrastructure/ai/tts_grpc_provider.rs)) para generar un archivo `.ogg`.
   - Llama a **ComfyUI** ([comfy_provider.rs](file:///home/jcoronado/Desktop/dev/flashcard/backend/src/infrastructure/ai/comfy_provider.rs)) para generar o resolver una imagen de FLUX.
5. **Almacenamiento y Sincronización:**
   - Si está en desarrollo local (`SYNC_TO_ORACLE=false`), el archivo se escribe directamente en el disco duro.
   - Si está en producción (`SYNC_TO_ORACLE=true`), el backend escribe el archivo temporal en `/tmp`, realiza un traspaso seguro mediante **SCP** a la máquina de **Oracle Proxy** en `/root/smart-proxy/repository/flashcard/`, y borra el temporal.
6. **Respuesta:** Se devuelve la URL pública del recurso servido por Caddy (`https://flashcard.theruby.lat/card_audio/...`).

### B. Modo conversacional Story Arcade
Cuando el usuario chatea en una historia:
1. **Cliente:** React envía la respuesta textual del usuario y el ID de la pantalla actual a `/api/analyze-error`.
2. **Backend:** El caso de uso `TutorUseCases` recibe la entrada.
3. **Consulta de IA:** Se envía un prompt optimizado a `Gemini 3.1 Flash-Lite` mediante gRPC ([gemini_grpc_provider.rs](file:///home/jcoronado/Desktop/dev/flashcard/backend/src/infrastructure/ai/gemini_grpc_provider.rs)) conteniendo:
   - Las instrucciones del sistema (System Prompt).
   - El contexto de la historia y el reto planteado.
   - La respuesta del usuario.
4. **Procesamiento de Errores y Persistencia:**
   - Gemini analiza si hay errores gramaticales y devuelve un análisis JSON estructurado.
   - Si hay fallas, el backend persiste el reporte detallado en la tabla `user_errors` de **SurrealDB**.
   - El progreso global se actualiza en `user_progress`.
5. **Respuesta:** Se le retorna al cliente la retroalimentación formateada de la IA.

---

## 3. Mecanismo de Tolerancia a Fallos (Degradación Elegante)

El backend de Rust implementa el patrón **Null Object** para garantizar que la aplicación no se detenga si SurrealDB no está disponible (por ejemplo, al correr en entornos efímeros sin persistencia local como GCP Cloud Run):

```rust
// Comportamiento dinámico durante la inicialización en backend/src/main.rs:
let (user_repo, sub_repo, card_repo, story_repo, activity_repo) = 
    match SurrealRepository::new(&surreal_url, "flashcard", "flashcard").await {
        Ok(repo) => {
            // Conexión exitosa -> Inyecta SurrealDB
            (repo.clone(), repo.clone(), ...)
        }
        Err(_) => {
            // Falla de conexión -> Inyecta NullDbRepository de forma transparente
            let repo = Arc::new(NullDbRepository);
            (repo.clone(), repo.clone(), ...)
        }
    };
```
* **Consecuencia:** El usuario puede seguir repasando las tarjetas basadas en JSONs locales, mientras que los módulos que dependen de SurrealDB (autenticación y Story Arcade) se deshabilitan o degradan de forma segura sin arrojar un error de pánico (`panic!`) en el servidor.

---

## 4. Guía de Desarrollo: ¿Cómo Añadir un Nuevo Módulo sobre la Marcha?

Cuando solicites crear un nuevo módulo (por ejemplo, un **Módulo de Facturación / Invoicing**), seguiremos los siguientes pasos estructurados para encajar perfectamente con la Clean Architecture y la infraestructura del sistema:

### Paso 1: Definir los Modelos y Puertos en el Dominio (Domain)
1. **Crear Modelo:** Agregar la estructura pura en el dominio (por ejemplo, en `backend/src/domain/models/`).
2. **Definir Contrato/Port:** Crear un trait de Rust en repositorios (en `backend/src/domain/repositories/`) para definir las operaciones necesarias de forma abstracta.

### Paso 2: Crear el Caso de Uso (Application Layer)
1. Crear el orquestador del caso de uso en `backend/src/application/use_cases/`.
2. Coordinar el flujo: recibir los parámetros, validar reglas del negocio y llamar a las abstracciones del dominio (traits) para persistir o interactuar.

### Paso 3: Crear el Adaptador Concreto (Infrastructure Layer)
1. Implementar el trait del repositorio para la base de datos (por ejemplo, en `surreal_repository.rs` o el proveedor correspondiente).
2. Implementar su correspondiente comportamiento en el adaptador de degradación (`NullDbRepository`) para asegurar que el sistema compila y corre si no hay base de datos.

### Paso 4: Crear e Inyectar en la Capa API (Axum Endpoints)
1. Crear el controlador de endpoints en `backend/src/api/endpoints/`.
2. Registrar las rutas y el estado compartido (`AppState`) en [main.rs](file:///home/jcoronado/Desktop/dev/flashcard/backend/src/main.rs).

### Paso 5: Implementar el Frontend (React 19)
1. **Crear Repositorio:** Agregar el archivo en `client/src/repositories/` que use `httpClient.js`.
2. **Crear Contexto o Store:** Si es necesario, añadir un context o store para manejar el estado reactivo del nuevo módulo.
3. **Crear UI:** Crear los componentes y pantallas de forma aislada dentro de su propia carpeta en `client/src/features/`, y registrarlos en `App.jsx`.
