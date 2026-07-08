# INFRASTRUCTURE & PIPELINE — Flashcard AI

Este documento provee una descripción detallada y actualizada (al 2026) sobre cómo está creada la infraestructura del proyecto, qué servicios posee, cómo se ejecuta todo, y cómo se configura el ciclo de integración y despliegue continuo (CI/CD).

---

## 1. Topología y Servicios de Infraestructura

La infraestructura de producción está distribuida para separar estrictamente el proceso intensivo de *build* (compilación) del proceso de *run* (ejecución pública y servicio de la API).

### Oracle Proxy (157.151.199.170) — Servidor Principal y Fuente de Verdad
Es el nodo más importante en tiempo de ejecución. Sirve como punto de entrada público seguro (SSL) a través de `fluency.lat`.
*   **Hardware/SO:** Oracle Cloud (OCI) ARM Ampere A1 (1 GB RAM, 2 vCPUs, Ubuntu 22.04).
*   **Servicios Activos:**
    *   **Caddy (`caddy-smart`)**: Actúa como proxy inverso. Sirve el SPA de React, gestiona SSL, maneja rutas estáticas e intercepta `/api/*` hacia el backend local.
    *   **Backend Rust (`flashcard-backend-node`)**: Ejecuta en el puerto 8080. Usa `SYNC_TO_ORACLE=false` (desconectado de SCP); escribe directamente los activos (archivos de audio, imágenes generadas y JSON) en el volumen del sistema. Se conecta a SurrealDB en **server-oci-1** (`10.0.1.138:8080`, VCN privada).
*   **Almacenamiento (Fuente de Verdad):** Todos los activos (`card_images/`, `card_audio/`, `json/`) viven y se consumen localmente desde `/root/smart-proxy/repository/flashcard/`. El backend lee y escribe al disco local sin demoras por SCP.

### SurrealDB — Base de Datos Centralizada (server-oci-1, 10.0.1.138)
*   **Hardware/SO:** Oracle Cloud (OCI) ARM Ampere (1 GB RAM, 2 vCPUs). Red privada VCN (`10.0.1.138:8080`); solo accesible desde el Oracle proxy (punto de entrada SSH).
*   **Almacenamiento:** SurrealDB 1.5.5 (RocksDB), `file:/data/surreal.db`. Namespace `flashcard` para prod, `qa_flashcard` para pre-prod.
*   **Índices:** `idx_card_progress_user` en tabla `card_progress` — single-field sobre `user_id` (el planner de 1.5.5 no utiliza índices multi-field).
*   **Funciones:** String en camelCase (e.g., `string::startsWith`, no `starts_with`). Transacciones multi-statement en una sola query (p.ej. `BEGIN TRANSACTION; UPDATE ...; COMMIT;`).

### Nodos Espejo y de Respaldo (Mirrors & Overflow)
Estos servidores mantienen el servicio disponible como respaldo, pero **no procesan la ruta pública principal** en tiempo de operación normal. Todos los mirrors reciben copias idénticas en el pipeline tirando la imagen desde Google Container Registry (GCR).
*   **AWS (34.229.229.255)**: EC2 t3.micro (Alpine Linux, 1 GB RAM). Corre Backend Rust. Usa `SYNC_TO_ORACLE=true` (sincroniza activos de vuelta hacia Oracle vía SCP).
*   **OCI-1 (129.158.214.227)**: Servidor ARM que corre otra réplica del Backend Rust puro (para carga/failover del backend, no de la DB).
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
2.  **OCI-1 Mirror & AWS Mirror:** Se envían *scripts* remotos (a través de `sshpass` a sus respectivas IPs) para que autentiquen con GCR, apaguen el backend viejo, hagan un `docker pull` nativo (sin recompilar gracias al arm64/amd64 bundle) y hagan un `docker run` con los comandos de sincronización (`SYNC_TO_ORACLE=true`) hacia el servidor central.

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

## 4. Entorno de Desarrollo Local

Para trabajar de manera local en el código, existe un entorno provisto en la raíz:
- **Base de datos activa del producto:** el backend actual trabaja contra **SurrealDB**; en desarrollo local, si `SURREAL_URL` no está disponible, el sistema puede degradar partes dependientes de persistencia mediante `NullDbRepository`. En desarrollo se puede usar el SurrealDB de producción vía SSH jump al Oracle proxy (ver `backend/.env`).
- **PostgreSQL 15 en Docker Compose:** queda reservado como infraestructura de apoyo para la futura capa de **pagos/suscripciones transaccionales**, donde se necesite almacenar transacciones de pago y conciliación. Esa parte **aún no está desarrollada** ni es la persistencia principal del producto hoy.
- **Frontend Local:** En `client/`, usando los `.env.development` y los comandos convencionales de Node/Bun.
