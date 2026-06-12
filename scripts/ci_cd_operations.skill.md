# 🚀 Skill: CI/CD Operations (Azure Pipelines)

> **Fuente de verdad:** [`docs/infrastructure/pipeline-and-deploy.md`](../docs/infrastructure/pipeline-and-deploy.md)
> Este skill resume operaciones; si hay conflicto, gana el documento canónico.

## 📋 Prerrequisitos

- Azure DevOps: org `safejcoronado1982`, proyecto `theruby`
- Variable Group **`Flashcard-Secrets`** (secretos cifrados)
- Service Connection SSH: **`SrvPortfolio`** → Oracle `157.151.199.170`
- Agente **`LocalBuild`** online en PC dev (`~/azp-agent-localbuild`)
- Agente **`Default`** online (Oracle) para deploys

## 🏗️ Arquitectura (no confundir)

| Pool | Dónde | Compila | Despliega |
|------|-------|---------|-----------|
| `LocalBuild` | PC dev | Front (bun) + Backend (buildx) | No |
| `Default` | Oracle agent | No | Front, GCP, mirrors |

Deploy **serializado:** stage 3 → 4 → 5. Mirrors: Oracle → OCI-1 → AWS.

## 🛠️ Procedimientos

### Disparar pipeline

```bash
az pipelines build queue \
  --organization https://dev.azure.com/safejcoronado1982 \
  --project theruby \
  --definition-name "jcoronado1982.flashcard" \
  --branch main
```

**Un solo build a la vez** — no encolar manual + CI simultáneo.

Trigger automático en push a `main` si cambia: `azure-pipelines.yml`, `client/**`, `backend/**`, `infra/**`.

### Inspeccionar builds

```bash
az pipelines build list --definition-ids 2 --top 5 --output table

az devops invoke --area build --resource timeline \
  --route-parameters project=theruby buildId=[ID] --output json
```

### Verificar post-deploy

```bash
curl -sf https://flashcard.theruby.lat/api/health
```

## 🔐 Secretos en deploy Oracle (patrón actual)

1. Job lee variables de `Flashcard-Secrets`
2. `GCP_CREDS_B64` = base64(`GCP_KEY_JSON`) como variable secreta del job
3. **`SSH@0` con `runOptions: inline`** exporta todas las vars
4. `bootstrap-oracle.sh --backend-only` → `deploy-oracle-backend.sh`
5. Login GCR efímero (`docker-gcr-auth.sh`), sin `/tmp/gcp-deploy-key.json`

**NO usar:** `CopyFilesOverSSH` de JSON GCP, SSH `commands` con múltiples `export`, `FLASHCARD_DEPLOY_ENV_B64` blob.

## 📁 Scripts canónicos

Copiados a `/root/smart-proxy/infra-proxy/` en cada deploy:

- `bootstrap-oracle.sh`
- `deploy-oracle-backend.sh`
- `deploy-caddy.sh`
- `docker-gcr-auth.sh`

**Regla:** no poner `docker run` largo en `azure-pipelines.yml`.

## ⚠️ Troubleshooting

| Error | Causa | Solución |
|-------|-------|----------|
| `DATABASE_URL is required` | SSH `commands` vs `inline` | `runOptions: inline` |
| `maximum parallel jobs` | Varios builds o deploys paralelos | Un build; stages serializados |
| `DeadlineExceeded` GCR push | Timeout red | Reintentar (pipeline tiene 3 intentos) |
| `mktemp: Invalid argument` AWS | BusyBox Alpine | `mktemp /tmp/foo-XXXXXX` |
| LocalBuild offline | PC apagada | Encender PC + agente systemd |
| Audio 500 ssh 255 | `SYNC_TO_ORACLE=true` en Oracle | Ver `oracle-local-backend-deploy.md` |

## 🚫 Patrones obsoletos

Ver tabla completa en [`pipeline-and-deploy.md`](../docs/infrastructure/pipeline-and-deploy.md#patrones-obsoletos--no-reintroducir).
