# Oracle Local Backend — Runtime en producción (Jun 2026)

> **Documento para IAs y operadores.** Leer antes de tocar Caddy, el backend en Oracle o audio TTS.
> **Para pipeline CI/CD, secretos y compilación:** [`pipeline-and-deploy.md`](pipeline-and-deploy.md) (fuente de verdad).
> Última validación runtime: pipeline `#165` (2026-06-08).

---

## Resumen en una frase

**La API de flashcard en producción va a `localhost:8080` en Oracle y el backend escribe audio/imágenes/JSON directo en disco local — NO usa SSH/SCP ni overflow AWS para el tráfico normal.**

---

## Arquitectura actual (NO confundir con la anterior)

```
Usuario
  └── https://fluency.lat
        └── Caddy (caddy-smart, Oracle 157.151.199.170)
              ├── /flashcard/*     → SPA React (disco)
              ├── /card_audio/*    → disco /root/smart-proxy/repository/flashcard
              ├── /card_images/*   → disco (mismo path)
              ├── /json/*          → disco (mismo path)
              ├── /test/*          → proyecto independiente test1 en :8083 (NO es flashcard)
              └── /api/*           → reverse_proxy localhost:8080  ← BACKEND ORACLE LOCAL
```

### Flujo de audio TTS (flashcard)

```
POST /api/synthesize-speech
  → Caddy → flashcard-backend-node :8080
  → Google TTS genera .ogg
  → upload_blob() escribe en /data/card_audio/...  (volumen Docker)
  → mismo path en host: /root/smart-proxy/repository/flashcard/card_audio/...
  → Caddy sirve /card_audio/* desde ese disco
```

**Latencia:** escritura local, sin `sshpass`, sin `scp`, sin nueva conexión SSH por archivo.

---

## Configuración canónica del backend Oracle

Contenedor: `flashcard-backend-node`

| Variable | Valor en Oracle | Por qué |
|----------|-----------------|---------|
| `LOCAL_STORAGE_PATH` | `/data` | Raíz de almacenamiento dentro del contenedor |
| `SYNC_TO_ORACLE` | `false` | **Crítico.** Si es `true`, intenta SCP por SSH → falla o es lento |
| `PORT` | `8080` | Caddy apunta aquí |
| Volumen | `/root/smart-proxy/repository/flashcard:/data` | Mismo disco que sirve Caddy |
| Red | `--network host` | Acceso a SurrealDB en `127.0.0.1:8001` |

### Verificar en servidor

```bash
docker inspect flashcard-backend-node --format '{{range .Mounts}}{{.Source}} -> {{.Destination}}\n{{end}}'
docker inspect flashcard-backend-node --format '{{range .Config.Env}}{{println .}}{{end}}' | grep -E 'SYNC|LOCAL_STORAGE|PORT'
curl -sf http://127.0.0.1:8080/api/health
curl -sf https://fluency.lat/api/health
```

Valores esperados:
- Mount: `.../repository/flashcard -> /data`
- `SYNC_TO_ORACLE=false`
- `LOCAL_STORAGE_PATH=/data`

---

## Configuración canónica de Caddy

Archivo fuente: `infra/proxy/Caddyfile`

```caddyfile
handle /api/* {
    reverse_proxy localhost:8080   # NO usar api_with_overflow para flashcard API
}
```

### ❌ NO hacer (errores que ya ocurrieron)

| Error | Síntoma | Causa |
|-------|---------|-------|
| API vía AWS + `SYNC_TO_ORACLE=true` en Oracle | `500` en `/api/synthesize-speech`, mensaje `ssh mkdir falló con código 255` | Backend intenta SSH a sí mismo o sin credenciales |
| Backend sin volumen `/data` | `404` en `/card_audio/...` tras generar audio | Archivo guardado dentro del contenedor, Caddy sirve otro path |
| `SYNC_TO_ORACLE=true` en Oracle | Conexiones SSH extra, RAM desperdiciada en servidor 1 GB | Innecesario cuando backend y disco están en la misma VM |
| Cambiar solo Caddyfile en servidor sin pipeline | Config se pierde en próximo deploy | Fuente de verdad es el repo + pipeline |

---

## Scripts de despliegue (fuente de verdad)

Todo vive en `infra/proxy/`. El pipeline **copia y ejecuta** estos scripts; no duplicar lógica en YAML inline.

| Script | Función |
|--------|---------|
| `bootstrap-oracle.sh` | Crea carpetas, despliega backend y/o Caddy, reinicia monitors |
| `deploy-caddy.sh` | Build `fluency-proxy` + `docker run caddy-smart` con todos los volúmenes |
| `deploy-oracle-backend.sh` | Pull imagen GCR + `flashcard-backend-node` con volumen `/data` |
| `deploy.sh` | Alias de `deploy-caddy.sh` |

### Uso manual en Oracle (migración / recuperación)

```bash
# Todo el stack Oracle (backend + Caddy + monitors)
bash /root/smart-proxy/infra-proxy/bootstrap-oracle.sh --all

# Solo Caddy (tras cambio de Caddyfile)
bash /root/smart-proxy/infra-proxy/bootstrap-oracle.sh --caddy-only

# Solo backend (tras nuevo build de imagen)
FLASHCARD_BACKEND_ENV=/tmp/flashcard-backend.env \
  bash /root/smart-proxy/infra-proxy/bootstrap-oracle.sh --backend-only --no-monitors
```

El archivo `/tmp/flashcard-backend.env` lo genera el pipeline con secrets de Azure DevOps.

---

## Pipeline Azure

**Ver documentación completa:** [`pipeline-and-deploy.md`](pipeline-and-deploy.md)

Resumen para este documento (solo runtime Oracle):

| Stage | Qué afecta a Oracle producción |
|-------|-------------------------------|
| 3 — Deploy Front | Caddy + SPA → `bootstrap-oracle.sh --caddy-only` |
| 5 — Mirror Oracle | Backend → `bootstrap-oracle.sh --backend-only` vía SSH `inline` + secretos Azure |

Reglas que aplican aquí (el resto del pipeline está en el otro doc):

1. **NO** `SYNC_TO_ORACLE=true` en contenedor Oracle.
2. **NO** quitar volumen `repository/flashcard:/data`.
3. **SÍ** `reverse_proxy localhost:8080` en Caddyfile para `/api/*`.

---

## AWS y GCP (rol actual — secundario para fluency.lat)

| Servidor | Rol hoy | SYNC_TO_ORACLE | Notas |
|----------|---------|----------------|-------|
| AWS `34.229.229.255` | Espejo / backup backend | `true` | Sigue usando SCP hacia Oracle si genera assets |
| GCP Cloud Run | Overflow histórico | `true` | Pipeline stage 4 sigue desplegando |
| Oracle `157.151.199.170` | **Primario en producción** | `false` | API y almacenamiento local |

El snippet `api_with_overflow` (AWS → GCP) **sigue en Caddyfile** pero **ya no se usa** para `/api/*` de flashcard. No reactivarlo sin revisar este documento.

`aws-health-monitor.sh` puede seguir corriendo; no afecta el routing actual de `/api/*`.

---

## Proyecto independiente `/test` (test1)

- URL: `https://fluency.lat/test`
- Contenedor: `audio-clone-rust` en puerto **8083**
- **NO** mezclar con flashcard-backend-node
- Despliegue: **manual** (no usa pipeline flashcard)
- Caddy: `handle /test*` con `strip_prefix /test` → `:8083`

---

## Diagnóstico rápido de audio roto

```bash
# 1. API responde
curl -sf https://fluency.lat/api/health

# 2. Backend Oracle bien configurado
ssh root@157.151.199.170 \
  'docker inspect flashcard-backend-node --format "{{range .Config.Env}}{{println .}}{{end}}" | grep SYNC'

# 3. Caddy apunta a localhost (no AWS)
ssh root@157.151.199.170 \
  'docker exec caddy-smart grep -A2 "reverse_proxy localhost:8080" /etc/caddy/Caddyfile'

# 4. Probar síntesis (requiere JWT de usuario autenticado)
# Si 500 con "ssh mkdir" → SYNC_TO_ORACLE=true o API yendo a AWS
```

---

## Historial del cambio

| Fecha | Qué pasó |
|-------|----------|
| 2026-06-07 | Audio flashcard fallaba: API iba a AWS, SCP SSH código 255 |
| 2026-06-07 | Fix: Caddy → `localhost:8080`, backend Oracle con volumen `/data`, `SYNC_TO_ORACLE=false` |
| 2026-06-07 | Scripts `bootstrap-oracle.sh`, `deploy-oracle-backend.sh`, `deploy-caddy.sh` + pipeline actualizado |
| 2026-06-07 | Pipeline #154 succeeded — config reproducible en cada deploy |
| 2026-06-08 | Secretos efímeros, SSH inline, deploy serializado — ver `pipeline-and-deploy.md` |
| 2026-06-08 | Pipeline #165 — 5 stages OK |

---

## Terraform vs Pipeline

- **Pipeline + `infra/proxy/*.sh`** → configuración de contenedores y Caddy en VM existente (**usar esto**).
- **Terraform** → solo si se provisiona VM/red/DNS desde cero; no reemplaza los scripts de deploy de aplicación.
