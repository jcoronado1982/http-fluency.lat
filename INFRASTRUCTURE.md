# INFRASTRUCTURE & PIPELINE — Flashcard AI

Este documento provee una descripción detallada y actualizada (al 2026) sobre cómo está creada la infraestructura del proyecto, qué servicios posee, cómo se ejecuta todo, y cómo se configura el ciclo de integración y despliegue continuo (CI/CD).

---

## 1. Topología y Servicios de Infraestructura

La infraestructura de producción está distribuida para separar estrictamente el proceso intensivo de *build* (compilación) del proceso de *run* (ejecución pública y servicio de la API).

### Oracle Proxy (157.151.199.170) — Servidor Principal y Fuente de Verdad
Es el nodo más importante en tiempo de ejecución. Sirve como punto de entrada público seguro (SSL) a través de `fluency.lat`.
*   **Hardware/SO:** Oracle Cloud (OCI) x86_64 AMD EPYC (1 GB RAM, 2 vCPUs, Alpine Linux). *(Corregido jul 2026: la doc decía ARM Ampere/Ubuntu; verificado en vivo con `uname -m` — es x86_64/Alpine.)*
*   **Servicios Activos:**
    *   **Caddy (`caddy-smart`)**: Actúa como proxy inverso. Sirve el SPA de React, gestiona SSL, maneja rutas estáticas e intercepta `/api/*` hacia el backend local.
    *   **Backend Rust (`flashcard-backend-node`)**: Ejecuta en el puerto 8080. Usa `SYNC_TO_ORACLE=false` (desconectado de SCP) **y `ORACLE_REPOSITORY_ONLY=false`** — CRÍTICO: el default del binario es `true` y sin esta variable el backend se trata a sí mismo como repositorio remoto (SSH a sí mismo sin contraseña) y ninguna búsqueda por prefijo (audio legacy) encuentra nada; incidente completo en `docs/INCIDENT_REPORT_AUDIO_ORACLE_MODE_2026-07.md`. Escribe directamente los activos (archivos de audio, imágenes generadas y JSON) en el volumen del sistema. Se conecta a SurrealDB en **server-oci-1** (`10.0.1.138:8080`, VCN privada).
*   **Almacenamiento (Fuente de Verdad):** Todos los activos (`card_images/`, `card_audio/`, `json/`) viven y se consumen localmente desde `/root/smart-proxy/repository/flashcard/`. El backend lee y escribe al disco local sin demoras por SCP.

### SurrealDB — Base de Datos Centralizada (server-oci-1, 10.0.1.138)
*   **Hardware/SO:** Oracle Cloud (OCI) x86_64 AMD EPYC 7551 (1 GB RAM, 1 vCPU, Alpine Linux). Red privada VCN (`10.0.1.138:8080`); solo accesible desde el Oracle proxy (punto de entrada SSH).
*   **Almacenamiento:** SurrealDB 1.5.5 (RocksDB), `file:/data/surreal.db`. Namespace `flashcard` para prod, `qa_flashcard` para pre-prod.
*   **Índices:** `idx_card_progress_user` en tabla `card_progress` — single-field sobre `user_id` (el planner de 1.5.5 no utiliza índices multi-field).
*   **Funciones:** String en camelCase (e.g., `string::startsWith`, no `starts_with`). Transacciones multi-statement en una sola query (p.ej. `BEGIN TRANSACTION; UPDATE ...; COMMIT;`).

### Nodos Espejo y de Respaldo (Mirrors & Overflow)
Estos servidores mantienen el servicio disponible como respaldo, pero **no procesan la ruta pública principal** en tiempo de operación normal. Todos los mirrors reciben copias idénticas en el pipeline tirando la imagen desde Google Container Registry (GCR).
*   **AWS (34.229.229.255)**: EC2 t3.micro (Alpine Linux, 1 GB RAM). Corre Backend Rust. Usa `SYNC_TO_ORACLE=true` (sincroniza activos de vuelta hacia Oracle vía SCP).
*   **OCI-1 (129.158.214.227)**: **No corre Backend Rust.** Dedicado exclusivamente a SurrealDB (ver sección anterior); el pipeline solo le despliega `deploy-surrealdb-oci1.sh` / `oci1-db-tuning.sh` (`azure-pipelines.yml`, job `Mirror_OCI1`). Detalle completo en `docs/infrastructure/ARQUITECTURA_ORACLE_DB.md` y `docs/infrastructure/server_inventory.md`.
*   **GCP Cloud Run**: Backend de overflow alojado en us-east1 (proyecto `launch-490115`). Escala a cero y se mantiene como fallback sin estado (usa llamadas remotas para guardar archivos).

### Servidor de Compilación (LocalBuild / PC Dev)
*   **Uso exclusivo:** Compilación de artefactos y empuje de imágenes a registros de Docker (no expone la aplicación al público).
*   **Características:** ~30 GB RAM. Utiliza cachés de Bun y Docker (`cacheRef: gcr.io/launch-490115/flashcard-backend:buildcache`) acelerando los despliegues posteriores significativamente.

---

## 2. Pipeline de CI/CD (Azure Pipelines)

El ciclo de despliegue se divide en 6 *stages* bien definidos dentro del archivo `azure-pipelines.yml`. La regla de oro del diseño es **que la compilación ocurre en la PC de desarrollo (pool `LocalBuild`)**, mientras que los servidores como Oracle (pool `Default`, limitados de RAM) solo ejecutan los binarios compilados y distribuyen archivos.

### Stage 1: Build Frontend (🏗️ Build Front - LocalBuild)
1.  **Entorno:** Nodo con alta RAM (`LocalBuild`).
2.  **Operación:** 
    *   Recupera dependencias cacheadas usando `bun`.
    *   Instala los paquetes en la carpeta `client`.
    *   Construye el frontend de Vite configurando la API hacia producción (`VITE_API_URL='https://fluency.lat'`).
3.  **Salida:** Publica un artefacto llamado `flashcard-site` con la carpeta `dist/`.

### Stage 2: Build Backend (🦀 Cross-Compile Backend - LocalBuild)
1.  **Entorno:** Nodo `LocalBuild`.
2.  **Operación:**
    *   Se encarga de la *compilación cruzada* usando `docker buildx` para plataformas `amd64` y `arm64`.
    *   Utiliza el `Dockerfile` optimizado en `/backend`. Esta optimización permite que un mismo contenedor sirva tanto a servidores X86 (AWS/GCP) como a servidores ARM (Oracle).
    *   Se usan *caches* alojados en Google Container Registry (GCR) para que las subsecuentes recompilaciones solo afecten el código alterado.
3.  **Salida:** Sube la imagen Docker etiquetada en múltiples formatos a `gcr.io/launch-490115/flashcard-backend`.

### Stage 3: Deploy Frontend (🚀 Deploy Front → Oracle Caddy)
1.  **Entorno:** Pool `Default` (Agente hospedado en el mismo Oracle).
2.  **Operación:**
    *   Descarga el artefacto SPA (`flashcard-site`) del Stage 1.
    *   Despliega (vía SCP/SSH) los archivos directamente al disco de Oracle en `/root/smart-proxy/flashcard`, ajustando sus permisos a 101:101.
    *   Copia los *scripts* de infraestructura canónicos (en `/infra/proxy/`) hacia `/root/smart-proxy/infra-proxy/`.
    *   Bootstrapea Caddy proxy para asegurar que los estáticos están listos para servirse.

### Stage 4: Deploy GCP (☁️ Deploy Backend → GCP Cloud Run)
1.  **Entorno:** Pool `Default`.
2.  **Operación:** 
    *   Lanza un comando `gcloud run deploy` apuntando a la nueva imagen subida en el Stage 2.
    *   Carga todas las variables de entorno necesarias secretas y de conexión (GCP, Gemini, base de datos de Oracle vía WSS).

### Stage 5: Deploy Mirrors (🔁 Replicate Mirrors: Oracle / OCI-1 / AWS)
Esta etapa ocurre en cascada.
1.  **Oracle Proxy Mirror:** Levanta el backend Rust de producción nativamente y se enlaza con Caddy. Usa variables de entorno embebidas por SSH sin tocar archivos locales vulnerables.
2.  **OCI-1 Mirror (job `Mirror_OCI1`):** No despliega backend. Solo copia y ejecuta `deploy-surrealdb-oci1.sh` / `oci1-db-tuning.sh` para mantener la instancia dedicada de SurrealDB (800m, `--network host`).
3.  **AWS Mirror (job `Mirror_AWS`):** Autentica con GCR, hace `docker pull` de la imagen backend (sin recompilar, gracias al bundle arm64/amd64) y `docker run` con `SYNC_TO_ORACLE=true` para sincronizar activos de vuelta hacia el servidor central Oracle.

### Stage 6: Cleanup (🧹 Cleanup artifacts + logs)
1.  **Operación:** Asegura la limpieza en ambos agentes (LocalBuild y Default). Borra workspaces (`site/`, `dist/`), archivos bash temporales, e invoca al API de Azure DevOps para **eliminar el artefacto de pipeline** generado, lo que previene saturación en el disco del servidor CI/CD.

---

## 3. Optimizaciones Fase A (Jul 2026)

Para soportar 500 usuarios concurrentes en servidores de 1 GB:

*   **Batch de tarjetas como transacción única:** `upsert_cards_batch` agrupa N tarjetas en `BEGIN TRANSACTION; ... COMMIT;` en una sola petición, eliminando N round-trips al WS compartido de Surreal.
*   **Índice en card_progress:** `DEFINE INDEX idx_card_progress_user ON card_progress FIELDS user_id;` — acota scans a filas del usuario.
*   **Conteo por prefijo en la DB:** `string::startsWith(deck, $prefix)` + `count()` sin traer filas al backend.
*   **Cache in-process:** racha diaria (`record_study_day`) y conteos estáticos (`list_categories_with_counts`) se memorizan con TTL 5 min.
*   **Watchdog de reconexión:** el backend auto-reconecta al WS de Surreal si muere (health-check cada 30s).

## 3.1 Optimizaciones Fase B (Jul 2026)

*   **Centinela sin forks por request:** `db_protection` en Caddy ya no usa `forward_auth` → socat → shell (6-8 procesos por CADA request, incluidos assets). Caddy evalúa directamente los archivos de estado (`/tmp/PROXY_CLOSED`, `/tmp/GATE_FILE`) con matchers `file` nativos. `sentinel-handler` y `traffic-manager` mantienen el invariante `PROXY_CLOSED existe ⟺ estado ≠ normal`; el puerto 8888 sigue sirviendo los endpoints de control (`/rojo`, `/amarillo`, `/normal`, `/status`, `/check`).
*   **Límite de RAM del backend en el proxy:** `deploy-oracle-backend.sh` ahora usa `--memory 512m` (`FLASHCARD_BACKEND_MEMORY_LIMIT`). Antes, un pico del backend (encode AVIF) podía provocar OOM global y tumbar Caddy; ahora Docker reinicia solo el backend.
*   **Cache-Control de imágenes en Caddy:** `/card_images/*` replica la política del backend (`assets.rs`): URL con `?v=`/`?t=` → `immutable` 1 año; sin versión → `no-cache` (revalidación 304 barata). Antes no había cabecera y el navegador podía mostrar imágenes viejas tras `force_generation` (mismo filename).
*   **Compresión en `/json/*`:** los decks JSON se sirven con zstd/gzip (−70 % egress). `browse` se mantiene: el backend lista directorios parseando ese HTML.
*   **Dependencias muertas eliminadas:** `sqlx` (Postgres aún no desarrollado), `google-cloud-storage` y `google-cloud-token` fuera de `api_main/Cargo.toml` — menos binario y menos tiempo de compilación. `openssl` vendored se conserva (lo requiere `native-tls` vía SurrealDB).
*   **Válvula de overflow conectada:** `oracle-ram-monitor.sh` siempre gestionó `/tmp/ORACLE_HEALTHY`, pero ningún matcher lo leía. Ahora `/api/*` de `fluency.lat` usa el snippet `api_with_overflow`: RAM libre > 250 MB → backend local; si no → GCP Cloud Run (scale-to-zero). Verificado funcionalmente con Caddy local (4 estados).
*   **Techos de RAM por contenedor** (la caja tiene 968 MB + 4 GB swap; medido en reposo: backend 43 MB, QA 14 MB, Caddy 80 MB): prod backend 512m, QA backend 128m + `cpu-shares 128` (`azure-pipelines.yml` — QA se usa poco y de noche; bajo contención cede la CPU a prod, con prod ocioso corre a velocidad completa), caddy-smart 384m. Los techos no reservan RAM; hacen determinista qué contenedor se reinicia ante un pico, en vez de dejar que el OOM killer del kernel tumbe la caja.
*   **Rotación de logs Docker:** `--log-opt max-size=10m --log-opt max-file=2` en backend y Caddy — con `RUST_LOG=info` y 500 usuarios los json-logs de Docker crecían sin límite.

## 3.2 Revisión y fixes (11 Jul 2026)

Detalle completo en `docs/reviews/2026-07-11-revision-infra-pipeline.md`. Cambios operativos:

*   **Caché de audio corregida (bug de matcher Caddy):** el matcher `query v=* t=*` exige AMBOS
    parámetros (AND) — nunca matcheó, así que la política "immutable con versión" no estaba activa
    ni para imágenes; y `/card_audio/*` era `immutable` incondicional (audio regenerado quedaba
    stale hasta 1 año en navegadores de otras sesiones). Ahora el snippet `asset_cache_policy`
    (expression CEL, verificado en vivo) aplica a imágenes Y audio, prod y QA: `?v=`/`?t=` →
    `immutable` 1 año; sin versión → `no-cache` + ETag (revalidación 304 sin cuerpo, ~0.26 s).
    `assets.rs` replica la política (audio ganó ETag/304 y dejó la heurística por nombre de archivo).
*   **Rotación de logs en SurrealDB (OCI-1):** `deploy-surrealdb-oci1.sh` ahora usa
    `--log-opt max-size=10m --log-opt max-file=2` (era el único contenedor sin rotación).
*   **Strays del centinela:** `deploy-caddy.sh` hace `pkill` de `traffic-manager`/`sentinel-handler`
    tras eliminar el contenedor (hubo un traffic-manager huérfano 71 días a nivel host duplicando
    el gate). Dentro del contenedor solo corre 1 instancia de cada uno (entrypoint).
*   **Credenciales Surreal fuera del YAML:** `SURREAL_USER`/`SURREAL_PASS` viven en el variable
    group `Flashcard-Secrets` (Azure DevOps). Pendiente recomendado: rotar el `root/root` real de la
    DB y dejar de reusar `OCI_PASSWORD` entre OCI-1 y AWS.
*   **iptables OCI-1:** eliminada la regla huérfana `ACCEPT tcp dpt:8001` (nada escucha ahí desde
    la migración del puerto); reglas persistidas en `/etc/iptables/rules-save`.
*   **Nota arm64:** ningún destino activo del pipeline es ARM (proxy y OCI-1 son x86_64; AWS t3.micro
    y Cloud Run también). El target `linux/arm64` del Stage 2 solo serviría para el worker Azure
    (ARM Ampere, fuera del pipeline) — candidato a eliminarse para acortar el build.

## 4. Entorno de Desarrollo Local

Para trabajar de manera local en el código, existe un entorno provisto en la raíz:
- **Base de datos activa del producto:** el backend actual trabaja contra **SurrealDB**; en desarrollo local, si `SURREAL_URL` no está disponible, el sistema puede degradar partes dependientes de persistencia mediante `NullDbRepository`. En desarrollo se puede usar el SurrealDB de producción vía SSH jump al Oracle proxy (ver `backend/.env`).
- **PostgreSQL 15 en Docker Compose:** queda reservado como infraestructura de apoyo para la futura capa de **pagos/suscripciones transaccionales**, donde se necesite almacenar transacciones de pago y conciliación. Esa parte **aún no está desarrollada** ni es la persistencia principal del producto hoy.
- **Frontend Local:** En `client/`, usando los `.env.development` y los comandos convencionales de Node/Bun.
