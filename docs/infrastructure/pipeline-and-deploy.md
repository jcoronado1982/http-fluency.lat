# Pipeline y Deploy — Guía canónica (Jun 2026)

> **Documento fuente de verdad** para IAs y operadores sobre CI/CD, compilación y despliegue.
> Si otro archivo contradice esto, **este documento manda** (salvo `SECRETS_MAP.md` para credenciales).

**Última validación:** pipeline build `#165` (`20260608.11`, commit `fe8cc2c`) — todos los stages en verde.

**Documentos relacionados (no duplicar lógica aquí):**
- Runtime Oracle / audio / Caddy: [`oracle-local-backend-deploy.md`](oracle-local-backend-deploy.md)
- Inventario servidores: [`INFRASTRUCTURE.md`](../../INFRASTRUCTURE.md)
- Scripts de deploy: `infra/proxy/*.sh`

---

## Resumen en una frase

**Tu PC compila (front + backend multi-arch); Oracle solo despliega (copia archivos, `docker pull`, `docker run`); los secretos vienen de Azure DevOps y nunca se guardan en disco en Oracle.**

---

## Dos pools de agentes

| Pool | Máquina | Qué hace | Qué NO hace |
|------|---------|----------|-------------|
| **`LocalBuild`** | PC del desarrollador (`~/azp-agent-localbuild`) | Compila frontend (bun/vite), cross-compile Rust amd64+arm64, push GCR | No toca servidores de producción |
| **`Default`** | Agente en Oracle (`jcoronado-ubuntu-22`) | SSH/SCP a servidores, `docker pull`, `gcloud`, scripts `infra/proxy/` | **Nunca compila** Rust ni frontend |

**Requisito:** el agente `LocalBuild` debe estar **online** cuando corre el pipeline. Si el PC está apagado, fallan stages 1 y 2.

Instalación del agente local: `infra/ci/install-local-agent.sh`

---

## Flujo del pipeline (5 stages)

```
┌─────────────────────────────────────────────────────────────┐
│  PARALELO (pools distintos)                                 │
│  Stage 1 Build_Frontend  [LocalBuild]  bun + vite           │
│  Stage 2 Build_Backend   [LocalBuild]  docker buildx → GCR  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼  SERIALIZADO en pool Default
                    Stage 3 Deploy_Frontend (Oracle Caddy)
                              │
                              ▼
                    Stage 4 Deploy_GCP (Cloud Run)
                              │
                              ▼
                    Stage 5 Deploy_Mirrors
                         Oracle → OCI-1 → AWS  (jobs en cadena)
```

### Por qué los deploys van en serie (no en paralelo)

Antes, stages 3, 4 y 5 arrancaban a la vez → **5 jobs** compitiendo por **1 agente** `Default` y límite de paralelismo self-hosted → colas y fallos.

**Ahora (`fe8cc2c`):**
- Stage 4 espera a Stage 3 (`dependsOn: Deploy_Frontend`)
- Stage 5 espera a Stage 4 (`dependsOn: Deploy_GCP`, con skip si build backend falló)
- Dentro del stage 5: `Mirror_OCI1` → `dependsOn: Mirror_Oracle`; `Mirror_AWS` → `dependsOn: Mirror_OCI1`

Stages 1 y 2 **siguen en paralelo** (correcto: usan `LocalBuild`, no compiten con Oracle).

---

## Stage 1 — Build Frontend (`LocalBuild`)

- Cache de módulos bun (`Cache@2`)
- `VITE_API_URL=https://fluency.lat` (**sin** `/api` al final)
- Publica artefacto `flashcard-site` (`client/dist`)

*Nota: Durante la transición, `https://flashcard.theruby.lat` sigue operativo.*

---

## Stage 2 — Cross-Compile Backend (`LocalBuild`)

- `docker buildx` plataformas `linux/amd64,linux/arm64`
- Push a `gcr.io/launch-490115/flashcard-backend:latest`
- Cache registry: `gcr.io/launch-490115/flashcard-backend:buildcache` (`mode=min`)
- **3 reintentos** de push con re-login GCR (evita `DeadlineExceeded`)
- Timeout job: 45 min; `DOCKER_CLIENT_TIMEOUT=300`
- Login GCR: task `Docker@2` + re-login con `GCP_KEY_JSON` en reintentos

**No ejecutar buildx en Oracle** (1 GB RAM — regla de oro).

---

## Stage 3 — Deploy Frontend (`Default` → Oracle)

1. Descarga artefacto `flashcard-site`
2. `CopyFilesOverSSH` → `/root/smart-proxy/flashcard`
3. `CopyFilesOverSSH` → sync `infra/proxy/*` a `/root/smart-proxy/infra-proxy/`
4. `SSH@0` → `bootstrap-oracle.sh --caddy-only`

Scripts copiados en cada deploy: `bootstrap-oracle.sh`, `deploy-caddy.sh`, `deploy-oracle-backend.sh`, `docker-gcr-auth.sh`, etc.

---

## Stage 4 — Deploy GCP Cloud Run (`Default`)

- Solo si Stage 2 succeeded
- `gcloud run deploy flashcard-backend` con imagen `:latest` de GCR
- Espejo/overflow histórico; **producción principal no depende de Cloud Run**

---

## Stage 5 — Replicate Mirrors (`Default`)

Condición: `Deploy_Frontend` OK y `Deploy_GCP` Succeeded o Skipped (si falló compile, mirrors igual despliegan imagen anterior).

### A. Oracle Proxy Mirror

1. Prepara `GCP_CREDS_B64` (base64 de `GCP_KEY_JSON`) como variable secreta del job
2. Sync scripts `infra/proxy` (si no llegaron en stage 3)
3. **`SSH@0` con `runOptions: inline`** (obligatorio — ver sección Secretos)

Ejecuta `bootstrap-oracle.sh --backend-only --no-monitors`

### B. OCI-1 Mirror (`129.158.214.227`)

- Genera `deploy-oci1.sh`, SCP + SSH con `sshpass`
- Login GCR efímero (`DOCKER_CONFIG` temp), `GOOGLE_CREDENTIALS_JSON` en env del contenedor
- **Después de** Oracle (`dependsOn: Mirror_Oracle`)

### C. AWS Mirror (`34.229.229.255`, Alpine)

- Igual patrón que OCI-1 pero `doas docker` y `mktemp /tmp/gcp-key-XXXXXX` (BusyBox — **sin** `.json` después de `XXXXXX`)
- `SYNC_TO_ORACLE=true` (espejo remoto con SCP a Oracle)
- **Después de** OCI-1 (`dependsOn: Mirror_OCI1`)

---

## Secretos — flujo actual (NO usar patrones viejos)

### Fuente de verdad

**Azure DevOps → Variable Group `Flashcard-Secrets`**

Variables clave: `GCP_KEY_JSON`, `DATABASE_URL`, `GEMINI_API_KEY`, `GEMINI_TTS_API_KEY`, `JWT_SECRET`, `GOOGLE_CLIENT_ID`, `GCP_API_KEY`, `OCI_PASSWORD`, `ORACLE_HOST`, `ORACLE_SSH_PASSWORD`, `SUPER_ADMIN_EMAIL`

> `GEMINI_TTS_API_KEY_BACKUP` es **solo local** (`backend/.env`) para `--batch-gen-audio`; no va en Azure ni en el contenedor de producción.

### Oracle backend deploy (sin archivos en disco)

```
Pipeline job Mirror_Oracle
  └─ GCP_CREDS_B64 = base64(GCP_KEY_JSON)  [variable secreta del job]
       └─ SSH inline (UN solo script, una sesión shell):
            export DATABASE_URL="..."
            export GOOGLE_CREDENTIALS_JSON="$(GCP_CREDS_B64)"
            ...
            bash bootstrap-oracle.sh --backend-only
                 └─ deploy-oracle-backend.sh
                      ├─ gcr_docker_login() → tmp + DOCKER_CONFIG → pull → borrar
                      └─ docker run -e GOOGLE_CREDENTIALS_JSON=...  (sin montar /gcp/key.json)
```

El backend Rust decodifica `GOOGLE_CREDENTIALS_JSON` (base64) y escribe `/tmp/gcp-credentials.json` **dentro del contenedor**.

### Reglas de SSH@0 (críticas para IAs)

| Modo | Comportamiento | Usar para |
|------|----------------|-----------|
| `runOptions: commands` | **Cada línea = proceso separado** — `export` NO persiste | Comandos independientes (ej. un solo `curl`) |
| `runOptions: inline` | **Un script = una sesión** — `export` persiste | Deploy Oracle con variables de entorno |

**Error histórico:** `DATABASE_URL is required` con `export` visible en log → causado por `commands` en lugar de `inline`.

### Archivos que NO deben quedar en Oracle

| Archivo | Estado |
|---------|--------|
| `/tmp/gcp-deploy-key.json` | **Obsoleto** — borrar si existe |
| `/tmp/flashcard-backend.env` | **Obsoleto** — borrar si existe |
| `~/.docker/config.json` con credencial GCR permanente | **Evitar** — usar `docker-gcr-auth.sh` |

---

## Scripts canónicos (`infra/proxy/`)

| Script | Función |
|--------|---------|
| `bootstrap-oracle.sh` | Orquesta deploy backend y/o Caddy |
| `deploy-oracle-backend.sh` | Pull imagen, run contenedor, health check |
| `deploy-caddy.sh` | Build `theruby-proxy`, restart `caddy-smart` |
| `docker-gcr-auth.sh` | Login GCR efímero (`DOCKER_CONFIG` temp) |

**Regla:** no poner `docker run` largo inline en `azure-pipelines.yml` para Oracle. Toda config de contenedores Oracle vive en estos scripts.

---

## Disparar el pipeline

**Trigger automático** en push a `main` si cambia:
- `azure-pipelines.yml`
- `client/**`
- `backend/**`
- `infra/**`

**Manual:**
```bash
az pipelines build queue \
  --organization https://dev.azure.com/safejcoronado1982 \
  --project theruby \
  --definition-name "jcoronado1982.flashcard" \
  --branch main
```

**Importante:** lanzar **un solo build** a la vez. No encolar manual + CI simultáneo (compiten por el mismo agente).

---

## Verificación post-deploy

```bash
curl -sf https://fluency.lat/api/health
# {"status":"ok","service":"flashcard-rust-backend",...}

ssh root@157.151.199.170 "docker ps --format 'table {{.Names}}\t{{.Status}}'"
# flashcard-backend-node, caddy-smart Up

# No debe existir:
ssh root@157.151.199.170 "ls /tmp/gcp-deploy-key.json /tmp/flashcard-backend.env 2>&1"
```

---

## Patrones OBSOLETOS — no reintroducir

| Patrón viejo | Por qué está mal | Reemplazo actual |
|--------------|------------------|------------------|
| `CopyFilesOverSSH` de `gcp-deploy-key.json` a Oracle | Secreto en disco | `GOOGLE_CREDENTIALS_JSON` vía SSH `inline` |
| `FLASHCARD_DEPLOY_ENV_B64` blob único en SSH | No llegaba al script remoto | `export` individual en script `inline` |
| SSH `runOptions: commands` con múltiples `export` | Variables no persisten | `runOptions: inline` |
| `docker login` permanente en `~/.docker/config.json` | Credencial en disco | `docker-gcr-auth.sh` |
| `-v /tmp/gcp-deploy-key.json:/gcp/key.json` | JSON en host Oracle | `GOOGLE_CREDENTIALS_JSON` env |
| Stages 3+4+5 en paralelo en `Default` | Cola por 1 agente | `dependsOn` en cadena |
| 3 mirror jobs en paralelo | Misma cola | `dependsOn` Oracle→OCI-1→AWS |
| Compilar en Oracle ARM | OOM / disco lleno | `LocalBuild` en PC |
| `SYNC_TO_ORACLE=true` en contenedor **Oracle** | SSH por archivo, error 255 | `false` + volumen `/data` |
| `apt-get install sshpass` en job mirror | Sin permisos en agente | `command -v sshpass` (ya instalado) |
| `mktemp /tmp/foo.XXXXXX.json` en Alpine | BusyBox: Invalid argument | `mktemp /tmp/foo-XXXXXX` |

---

## Troubleshooting rápido

| Síntoma | Causa | Acción |
|---------|-------|--------|
| `DATABASE_URL is required` en deploy Oracle | SSH `commands` en vez de `inline` | Usar `runOptions: inline` |
| `maximum parallel jobs Self-Hosted` | Varios builds o stages en paralelo | Un build; deploy serializado |
| `DeadlineExceeded` push GCR | Red/timeout transitorio | Reintentar pipeline (ya hay 3 intentos) |
| `mktemp: Invalid argument` en AWS | Template mktemp en Alpine | Sufijo `XXXXXX` al final |
| `SUPER_ADMIN_EMAIL: command not found` | `$(VAR)` sin sustituir en heredoc | Asignar `VAR_VAL='$(VAR)'` antes del heredoc |
| Audio 500 `ssh mkdir 255` | `SYNC_TO_ORACLE=true` en Oracle | Ver [`oracle-local-backend-deploy.md`](oracle-local-backend-deploy.md) |
| LocalBuild offline | PC apagada o agente parado | `systemctl status` en `~/azp-agent-localbuild` |

---

## Historial de cambios relevantes

| Fecha | Build / commit | Cambio |
|-------|----------------|--------|
| 2026-06-07 | `#154` / `cf1c7a3` | Backend Oracle local, scripts `infra/proxy/` |
| 2026-06-08 | `8441e3f` | Secretos efímeros, sin `gcp-deploy-key.json` |
| 2026-06-08 | `8a49d4a` | SSH `inline` para exports |
| 2026-06-08 | `fe8cc2c` | Reintentos GCR, deploy serializado, mirrors en cadena |
| 2026-06-08 | `#165` | Primer pipeline completo en verde con nueva arquitectura |
