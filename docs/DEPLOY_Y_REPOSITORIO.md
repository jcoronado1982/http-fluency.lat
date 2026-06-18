# Deploy, repositorio y CI/CD — Fluency (Jun 2026)

> **Fuente de verdad** para Git, Azure DevOps y dominio de producción.
> Detalle operativo del pipeline: [`infrastructure/pipeline-and-deploy.md`](infrastructure/pipeline-and-deploy.md).

---

## Identidad del producto

| Concepto | Valor actual |
|----------|----------------|
| **Marca / dominio** | [fluency.lat](https://fluency.lat) |
| **Nombre interno legado** | Flashcard (paths en servidor, imagen GCR) — no renombrar sin plan de migración |
| **Dominio en transición** | theruby.lat (secundario; ver `.cursorrules`) |

---

## Repositorio Git

| Campo | Valor |
|-------|--------|
| **Repo canónico** | `https://github.com/jcoronado1982/http-fluency.lat.git` |
| **Repo obsoleto** | `jcoronado1982/flashcard` — ya no recibe deploys |
| **Rama desarrollo** | `dev` — trabajo diario (sin deploy automático) |
| **Rama pre-prod** | `qa` → `/root/smart-proxy/qa_flashcard` |
| **Rama producción** | `main` → `/root/smart-proxy/flashcard` en Oracle |

```bash
git remote -v
# origin  https://github.com/jcoronado1982/http-fluency.lat.git
```

Push a `qa` o `main` dispara el pipeline si cambian `client/**`, `backend/**`, `infra/**` o `azure-pipelines.yml`.  
**`dev` no despliega** — ver [GIT_BRANCHES.md](GIT_BRANCHES.md).

---

## Azure DevOps

| Campo | Valor |
|-------|--------|
| **Organización** | `https://dev.azure.com/safejcoronado1982` |
| **Proyecto** | `theruby` (nombre histórico del proyecto Azure; la app es Fluency) |
| **Pipeline** | `jcoronado1982.fluency` (id **2**) |
| **Pipeline obsoleto** | `jcoronado1982.flashcard` — renombrado |
| **Usuario / correo** | Jesus Coronado — `safe.jcoronado1982@outlook.com` |
| **Conexión GitHub** | `jcoronado1982 (1)` → cuenta GitHub `jcoronado1982` |
| **Variable group** | `Flashcard-Secrets` |
| **SSH service connection** | `SrvPortfolio` → Oracle `157.151.199.170` |

### Disparar deploy manual

```bash
# Producción
az pipelines build queue \
  --organization https://dev.azure.com/safejcoronado1982 \
  --project theruby \
  --definition-name "jcoronado1982.fluency" \
  --branch main

# Pre-prod
az pipelines build queue \
  --organization https://dev.azure.com/safejcoronado1982 \
  --project theruby \
  --definition-name "jcoronado1982.fluency" \
  --branch qa
```

### Verificación

```bash
curl -sf https://fluency.lat/api/health
```

---

## Artefactos con nombre legado (intencional)

Estos nombres **no** cambiaron para no romper producción:

| Recurso | Nombre actual | Notas |
|---------|---------------|--------|
| Imagen Docker backend (GCR) | `gcr.io/launch-490115/flashcard-backend` | Misma imagen en todos los mirrors |
| Paths Oracle SPA | `flashcard`, `qa_flashcard` | Carpetas bajo `/root/smart-proxy/` |
| Contenedor backend | `flashcard-backend-node` | Ver `deploy-oracle-backend.sh` |
| Variable group Azure | `Flashcard-Secrets` | Secretos cifrados en DevOps |

Renombrar requiere ventana de mantenimiento coordinada (GCR tag, Caddy volumes, env vars).

---

## Arquitectura modular (código)

- Backend: workspace Rust — `fluency_core`, `api_main`, `mod_flashcards`, `mod_pronoun`
- Frontend: registry en `client/src/modules/index.js`
- Sparse-checkout: `./scripts/sparse-module.sh flashcards|pronoun|admin|full`

Documentación: [`ARQUITECTURA_MODULAR.md`](ARQUITECTURA_MODULAR.md), [`GIT_SPARSE_WORKFLOW.md`](GIT_SPARSE_WORKFLOW.md).

---

## Historial de migración

| Fecha | Cambio |
|-------|--------|
| 2026-06-18 | Rama `dev` como desarrollo principal; flujo `dev` → `qa` → `main` |
| 2026-06-18 | Arquitectura modular (workspaces + registry frontend) en `main` y `qa` |
| 2026-06-08 | Pipeline serializado validado (build #165) — ver `pipeline-and-deploy.md` |
