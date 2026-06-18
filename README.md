# Fluency

Plataforma de aprendizaje de inglés (antes Flashcard AI). Flashcards con IA, práctica guiada de pronombres, tutor gramatical y despliegue en [fluency.lat](https://fluency.lat).

## Documentación del Sistema

| Archivo / Carpeta | Qué contiene |
|---|---|
| 🌿 **[docs/GIT_BRANCHES.md](docs/GIT_BRANCHES.md)** | Ramas: publicación **`dev-flashcards` → `qa` → `main`**; integración local en **`dev-full`**. |
| 🚀 **[docs/DEPLOY_Y_REPOSITORIO.md](docs/DEPLOY_Y_REPOSITORIO.md)** | Repo GitHub, Azure DevOps, pipeline `jcoronado1982.fluency`. |
| 📑 **[INFRASTRUCTURE.md](INFRASTRUCTURE.md)** | Servidores, capacidades, enrutamiento y pipeline CI/CD. |
| 🏗️ **[docs/ARQUITECTURA_MODULAR.md](docs/ARQUITECTURA_MODULAR.md)** | Clean/Hexagonal, registry, sparse-checkout, módulos plug & play. |
| 🗃️ **[database_schema_diagram.md](database_schema_diagram.md)** | Modelo SurrealDB y relaciones entre colecciones. |
| 📂 **[CODEBASE.md](CODEBASE.md)** | Índice técnico: directorios, endpoints, env vars. |
| 🔐 **[SECRETS_MAP.md](SECRETS_MAP.md)** | Credenciales locales (no subir al repo público). |

---

## Stack Tecnológico

| Capa | Tecnología |
|---|---|
| **Frontend** | React 19 + Vite + Tailwind CSS |
| **Backend** | Rust + Axum (Tokio) — workspace modular |
| **Base de datos** | SurrealDB |
| **Proxy / SSL** | Caddy v2 (`fluency-proxy` en Oracle) |
| **IA — Tutor** | Google Gemini (gRPC) |
| **IA — Audio** | Google Cloud Text-to-Speech |
| **Auth** | Google OAuth 2.0 → JWT |

---

## Servidores de Producción

| Servidor | Rol |
|---|---|
| **Oracle** `157.151.199.170` | Caddy, SPA, backend local, assets en disco |
| **GCP Cloud Run** | Mirror / failover del backend |
| **AWS / OCI** | Mirrors adicionales vía pipeline |

---

## Comandos Útiles

```bash
# Salud de la API
curl -s https://fluency.lat/api/health

# Stack local
./start.sh

# Trabajo por módulo (sparse-checkout)
./scripts/sparse-module.sh list
./scripts/sparse-module.sh flashcards
./scripts/sparse-module.sh pronoun

# Limpieza Azure DevOps (runs viejos + logs agente local)
./scripts/cleanup-ado-builds.sh --dry-run                              # simular
./scripts/cleanup-ado-builds.sh                                      # conserva último main + qa
./scripts/cleanup-ado-builds.sh --purge-all --clean-agent-logs       # reset total
```

Detalle en [docs/ARQUITECTURA_MODULAR.md](docs/ARQUITECTURA_MODULAR.md), [modules/README.md](modules/README.md) y [limpieza ADO](docs/infrastructure/pipeline-and-deploy.md#limpieza-de-logs-y-artefactos-en-azure-devops).
