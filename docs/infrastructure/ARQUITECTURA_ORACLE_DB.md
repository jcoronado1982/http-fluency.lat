# Arquitectura Oracle + SurrealDB (Jun 2026)

Documento de referencia para IA y desarrolladores. **Estado aplicado en producción** tras la migración de junio 2026.

---

## 1. Resumen en una frase

| Servidor | Rol |
|----------|-----|
| **Proxy Oracle** (`157.151.199.170`) | Caddy + Rust + assets estáticos (imágenes/audio/json) |
| **OCI-1 Oracle** (`129.158.214.227`) | **Solo SurrealDB** (base de datos de la app) |
| **Azure** (`172.202.197.64`) | **Solo Postgres** (suscripciones/pagos futuros) |

**NO confundir:** OCI-1 **no tiene Postgres**. Postgres está en Azure.

---

## 2. Mapa de servidores

```
Internet (fluency.lat)
        │
        ▼
┌─────────────────────────────────────────────────────────┐
│  PROXY — server-reverse-proxy                           │
│  IP pública:  157.151.199.170                           │
│  IP privada:  10.0.1.67                                  │
│  RAM: 968 MB (~527 MB disponibles tras migración)       │
│                                                         │
│  Contenedores ACTIVOS:                                  │
│    • caddy-smart          → :80 / :443                    │
│    • flashcard-backend-node → :8080 (Rust, prod)        │
│                                                         │
│  NO debe correr aquí:                                   │
│    ✗ surrealdb (movido a OCI-1)                         │
│    ✗ qa-flashcard-backend-node (eliminado en migración) │
└───────────────────────────┬─────────────────────────────┘
                            │
              Red privada VCN (10.0.1.0/24)
              WebSocket/TCP ~0.1–1 ms
                            │
                            ▼
┌─────────────────────────────────────────────────────────┐
│  OCI-1 — server-oci-1 (antes documentado como          │
│          "server-postgresql" — nombre histórico)        │
│  IP pública:  129.158.214.227                           │
│  IP privada:  10.0.1.138                                │
│  RAM: 968 MB (~436 MB disponibles)                      │
│                                                         │
│  Contenedor ACTIVO:                                       │
│    • surrealdb → :8080 (--network host)                 │
│      Límite memoria: 800 MB                             │
│                                                         │
│  NO debe correr aquí:                                   │
│    ✗ flashcard-backend-node (mirror eliminado)            │
│    ✗ caddy                                                │
│    ✗ postgres (nunca estuvo aquí; está en Azure)        │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│  AZURE — worker-alpine-native-1                         │
│  IP: 172.202.197.64:5432                                │
│  Postgres 16 — DATABASE_URL en backends                   │
│  NO tocar para flashcards/progreso (eso es SurrealDB)   │
└─────────────────────────────────────────────────────────┘
```

---

## 3. Puertos y variables críticas

### Proxy (157)

| Puerto | Servicio | Notas |
|--------|----------|-------|
| 80/443 | Caddy | SSL, fluency.lat |
| 8080 | Rust prod | `reverse_proxy localhost:8080` en Caddyfile |

**Variables del backend Rust (prod):**
```bash
SURREAL_URL=10.0.1.138:8080    # IP PRIVADA de OCI-1 — NO usar 127.0.0.1
SURREAL_NS=flashcard
SURREAL_DB=flashcard
SURREAL_USER=root
SURREAL_PASS=root
LOCAL_STORAGE_PATH=/data       # montado desde /root/smart-proxy/repository/flashcard
SYNC_TO_ORACLE=false
```

### OCI-1 (129)

| Puerto | Servicio | Notas |
|--------|----------|-------|
| 8080 | SurrealDB | `--bind 0.0.0.0:8080`, `--network host` |

**Puerto 8001:** obsoleto en OCI-1. Se usa **8080** porque la Security List de OCI ya permitía 8080 en la VCN privada (8001 estaba bloqueado).

**Firewall iptables en OCI-1:**
- Acepta `:8080` solo desde `10.0.1.67` (proxy)
- Acepta loopback (`lo`) para health checks locales
- Bloquea el resto del tráfico a `:8080`

---

## 4. Flujo de tráfico de usuario

```
Usuario → fluency.lat
    │
    ├─ /card_images/*, /card_audio/*, /json/*
    │      → Caddy sirve desde disco local del PROXY
    │      → NO pasa por red ni por Rust
    │
    ├─ /api/*
    │      → Caddy → Rust :8080 (mismo proxy)
    │      → Rust → SurrealDB 10.0.1.138:8080 (red privada)
    │      → Rust lee/escribe assets en disco local
    │
    └─ /db/*
           → Caddy → 10.0.1.138:8080
           → Para mirrors externos (AWS, Cloud Run) vía wss://fluency.lat/db
```

---

## 5. Optimización de progreso (batching) — 500 usuarios

### Frontend (`client/src/modules/flashcards/hooks/useDeckSession.js`)

- `markAsLearned` es **optimista**: UI avanza sin esperar red
- Acumula en `pendingBatchRef` (Map en memoria)
- Flush automático cuando:
  - Se acumulan **8 tarjetas** (`BATCH_FLUSH_SIZE = 8`)
  - Cambio de deck o grupo
  - `beforeunload` (fetch con `keepalive: true`)
  - Desmontaje del componente

### Backend

- `POST /api/update-batch` — hasta 50 tarjetas por lote
- `POST /api/update-status` — sigue existiendo (reset de grupo, compatibilidad)

### Archivos clave

| Capa | Archivo |
|------|---------|
| Trait DB | `backend/core/src/ports/db_repository.rs` → `upsert_cards_batch` |
| Surreal impl | `backend/api_main/src/infrastructure/storage/surreal/card_progress_repository.rs` |
| Use case | `backend/mod_flashcards/src/lib.rs` → `update_cards_batch` |
| HTTP | `backend/api_main/src/api/endpoints/decks.rs` → `update_cards_batch` |
| Ruta | `backend/api_main/src/modules/flashcards.rs` → `/api/update-batch` |
| Adapter FE | `client/src/modules/flashcards/adapters/flashcardHttpAdapter.js` → `updateCardsBatch` |

---

## 6. Scripts de deploy — cuál usar dónde

| Script | Dónde ejecutar | Propósito |
|--------|----------------|-----------|
| `infra/proxy/bootstrap-oracle.sh` | **Proxy 157** | Caddy + Rust. **NO despliega SurrealDB** |
| `infra/proxy/deploy-oracle-backend.sh` | **Proxy 157** | Solo backend Rust |
| `infra/proxy/deploy-caddy.sh` | **Proxy 157** | Solo Caddy |
| `infra/proxy/deploy-surrealdb-oci1.sh` | **OCI-1 129** | SurrealDB dedicado (800m, host network) |
| `infra/proxy/oci1-db-tuning.sh` | **OCI-1 129** | BBR + firewall iptables |
| `infra/proxy/deploy-surrealdb.sh` | **Solo dev local** | Legacy, límite 256m, puerto 8001 |

### Configuración SurrealDB en OCI-1 (producción)

```bash
docker run -d \
  --name surrealdb \
  --network host \
  --restart always \
  --memory 800m \
  --memory-swap 800m \
  -v /root/surreal_data:/data \
  surrealdb/surrealdb:v1.5.5 \
  start --user root --pass root --bind 0.0.0.0:8080 file:/data/surreal.db
```

**Por qué 800 MB:** servidor dedicado solo a DB + Alpine ligero (~100 MB SO). Antes en proxy tenía 256 MB y colapsaba al 73%.

---

## 7. Azure Pipelines (`azure-pipelines.yml`)

| Stage | Qué hace |
|-------|----------|
| Deploy Oracle (Mirror_Oracle) | Proxy: Caddy + Rust con `SURREAL_URL=10.0.1.138:8080` |
| Mirror_OCI1 | OCI-1: solo `deploy-surrealdb-oci1.sh` |
| Mirror_AWS | AWS overflow (sin cambios de DB) |

**Importante:** el job `Mirror_OCI1` usa `$(ociSshConn)` — verificar que el service connection exista en Azure DevOps. Si falla, usar sshpass como fallback manual.

---

## 8. Caddyfile — rutas DB

```caddyfile
# fluency.lat y qa.fluency.lat
handle /db/* {
    uri strip_prefix /db
    reverse_proxy 10.0.1.138:8080   # NO usar localhost:8001
}
```

---

## 9. Errores comunes que confunden a la IA

| Error | Realidad |
|-------|----------|
| "OCI-1 es el servidor Postgres" | **Falso.** Postgres está en **Azure** `172.202.197.64` |
| "SurrealDB está en el proxy" | **Falso desde jun 2026.** Está en OCI-1 `10.0.1.138:8080` |
| "Usar SURREAL_URL=127.0.0.1:8001 en prod" | **Falso.** Solo válido en dev local |
| "Puerto SurrealDB es 8001 en OCI-1" | **Falso.** Es **8080** (VCN firewall) |
| "Rust corre en OCI-1" | **Falso en prod.** Rust solo en proxy; OCI-1 solo DB |
| "Subir SURREAL_MEMORY_LIMIT a 350m en proxy" | **Obsoleto.** Surreal ya no está en proxy |
| "Apagar qa-flashcard-backend-node" | Ya no corre (eliminado en migración manual) |

---

## 10. Desarrollo local vs producción

| Entorno | SURREAL_URL | Notas |
|---------|-------------|-------|
| **Producción** | `10.0.1.138:8080` | Solo accesible desde red privada Oracle |
| **Local (`start.sh`)** | `127.0.0.1:8001` | SurrealDB en Docker local, modo `memory` |
| **PC del desarrollador** | No puede usar IP privada `10.0.1.138` | Usar Surreal local o túnel VPN |

**Probar producción:** ir a `https://fluency.lat` — no requiere deploy local.

---

## 11. Sentinel / monitoreo RAM

| Servidor | Monitor | Estado jun 2026 |
|----------|---------|-----------------|
| Proxy 157 | `oracle-ram-monitor.sh` + Sentinel en Caddy | Activo |
| OCI-1 129 | `ram-monitor` + `ram-responder` | **Desactivado** (eran del rol "postgresql" histórico) |

Umbral Sentinel proxy: `THRESHOLD_MB=250` en `oracle-ram-monitor.sh`.

---

## 12. Limpieza realizada (jun 2026)

- `docker system prune` en ambos servidores (~2.7 GB proxy, ~1.4 GB OCI-1)
- Imágenes antiguas de `flashcard-backend` eliminadas
- Contenedor `surrealdb` eliminado del proxy
- Datos `/root/surreal_data` eliminados del proxy (viven solo en OCI-1)
- Mirror `flashcard-backend-node` eliminado de OCI-1
- `qa-flashcard-backend-node` eliminado del proxy (durante redeploy manual)

---

## 13. Checklist para próximo deploy o intervención de IA

1. **¿Dónde va SurrealDB?** → Solo OCI-1 (`deploy-surrealdb-oci1.sh`)
2. **¿Dónde va Rust/Caddy?** → Solo Proxy (`bootstrap-oracle.sh --backend-only`)
3. **SURREAL_URL en prod** → `10.0.1.138:8080` (IP privada)
4. **No aumentar RAM en proxy para Surreal** → ya no vive ahí
5. **Límite memoria Surreal** → `800m` en OCI-1 (dedicado + Alpine)
6. **Comunicación** → red privada VCN, no IP pública `129.158.214.227`
7. **Postgres** → Azure, sin cambios
8. **Validar tras deploy:**
   ```bash
   curl https://fluency.lat/api/health
   curl http://10.0.1.138:8080/health   # desde proxy
   docker logs flashcard-backend-node | grep SurrealDB
   ```

---

## 14. Historial de cambios (jun 2026)

1. Batching frontend + endpoint `POST /api/update-batch`
2. Migración SurrealDB: Proxy → OCI-1 (datos vía `tar` + scp)
3. Red privada `10.0.1.67` → `10.0.1.138:8080`
4. `--network host` + BBR en OCI-1
5. Límite memoria Surreal: 256m → **800m**
6. Firewall iptables: solo proxy puede conectar a `:8080`
7. Limpieza Docker y servicios huérfanos
8. Scripts nuevos: `deploy-surrealdb-oci1.sh`, `oci1-db-tuning.sh`
9. `bootstrap-oracle.sh`: ya no llama `deploy-surrealdb.sh`

---

*Última verificación en producción: 29 jun 2026 — `fluency.lat/api/health` OK, Rust conectado a `10.0.1.138:8080`.*
