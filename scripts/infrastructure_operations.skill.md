# 🛠️ Skill: Operaciones de Infraestructura y Despliegue

Este manual define los procedimientos estándar para la gestión del proyecto Flashcard AI. **Cualquier IA operando en este repo DEBE seguir estas rutas de decisión.**

---

## 1. 🗄️ Gestión de Base de Datos (PostgreSQL)

### Datos de Destino
- **Host:** `172.202.197.64` (Azure - worker-alpine-native-1)
- **Base de Datos:** `flashcard_db`
- **Puerto:** `5432`

### Lógica de Ejecución
1. **Prioridad 1 (MCP):** Usar la herramienta `db_query` del servidor MCP personalizado en Rust.
2. **Prioridad 2 (Directo):** Si el MCP falla, usar la herramienta `az_cli` u `oci_cli` para abrir túneles o usar `ssh` con las llaves de `SECRETS_MAP.md`.

### Reglas de Seguridad
- **Validación de Esquema:** Antes de cualquier `ALTER` o `CREATE`, leer el archivo `schema.sql`.
- **Sentinel Check:** Ejecutar siempre la herramienta `sentinel_health` antes de operaciones masivas. Si la RAM libre es < 10%, ABORTAR operación.

---

## 2. 🚀 Estrategia de Despliegue (CI/CD)

### Método de Despliegue
- **Frontend (Oracle):** Automatizado vía Azure Pipelines (Copia vía SSH a la VM).
- **Backend (GCP Cloud Run):** Automatizado vía Azure Pipelines (Docker Build & Push a GCR).

### Lógica de Operación
1. **Despliegue Estándar:** Realizar `git push` a la rama `main`. El pipeline decidirá el despliegue según los filtros de ruta.
2. **Despliegue Manual / Emergencia:** 
   - Usar `az pipelines build queue --definition-id 2` para forzar una build.
   - NO usar `gcloud run deploy` manualmente a menos que el pipeline esté caído y sea una emergencia crítica.

---

## 3. ☁️ Gestión Multi-Cloud

### Azure
- **Uso:** Gestión de Pipelines y Azure DevOps.
- **Herramienta:** `az_cli`.

### GCP (Google Cloud)
- **Uso:** Hosting de Backend (Cloud Run) y Assets (GCS).
- **Herramienta:** `run_gcloud_command`.

### Oracle Cloud (OCI)
- **Uso:** Backend genérico para múltiples aplicaciones y procesamiento secundario.
- **Herramienta:** `oci_cli`.

### Amazon Web Services (AWS)
- **Uso:** Procesamiento redundante y Worker secundario.
- **Herramienta:** `aws_cli` (vía MCP o terminal).
- **Verificación:** `aws sts get-caller-identity`.

---

## 🔐 Manejo de Fallos
- Si un despliegue falla: Usar `az pipelines build list --definition-ids 2 --top 1` para identificar la build fallida y luego investigar logs.
- Si el Sentinel bloquea el tráfico: No forzar el desbloqueo sin antes optimizar la base de datos o escalar la instancia vía `oci_cli`.
