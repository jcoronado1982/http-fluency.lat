# Fluency

Plataforma de aprendizaje de inglés (antes Flashcard AI). Flashcards con IA, práctica guiada de pronombres, tutor gramatical y despliegue en [fluency.lat](https://fluency.lat).

## Contrato Arquitectónico

Antes de tocar código, asume esto:

- El repo usa **arquitectura de monolito modular** con **shell compartido + módulos conectables/desconectables**.
- La app debe poder correr con **solo el shell y los módulos activos**.
- Los módulos se controlan por `registry`, `Cargo features`, `Vite flags` y `git sparse-checkout`.
- Si un módulo no está en disco o no está habilitado, la aplicación no debe romperse; solo debe omitirlo.
- El `sparse-checkout` existe también para aislar contexto de IA: la IA debe ver solo el módulo en el que trabaja más el shell.

Documento canónico: [docs/ARQUITECTURA_MODULAR.md](docs/ARQUITECTURA_MODULAR.md)

## Documentación del Sistema

| Archivo / Carpeta | Qué contiene |
|---|---|
| ⚠️ **[docs/infrastructure/AI_OPERATIONS_CONTEXT.md](docs/infrastructure/AI_OPERATIONS_CONTEXT.md)** | Lectura obligatoria antes de optimizar: dos Oracle de 1 GB, cachés, Caddy/Cloudflare, riesgos y verificaciones. |
| 🌿 **[docs/GIT_BRANCHES.md](docs/GIT_BRANCHES.md)** | Ramas: publicación **`dev-flashcards` → `qa` → `main`**; integración local en **`dev-full`**. |
| 🚀 **[docs/DEPLOY_Y_REPOSITORIO.md](docs/DEPLOY_Y_REPOSITORIO.md)** | Repo GitHub, Azure DevOps, pipeline `jcoronado1982.fluency`. |
| 📑 **[INFRASTRUCTURE.md](INFRASTRUCTURE.md)** | Servidores, capacidades, enrutamiento y pipeline CI/CD. |
| 🌐 **[docs/infrastructure/media-delivery-cache.md](docs/infrastructure/media-delivery-cache.md)** | Oracle/Cloudflare, versionado y caché de imágenes y audio. |
| 🏗️ **[docs/ARQUITECTURA_MODULAR.md](docs/ARQUITECTURA_MODULAR.md)** | Clean/Hexagonal, registry, sparse-checkout, módulos plug & play. |
| 🗃️ **[database_schema_diagram.md](database_schema_diagram.md)** | Modelo SurrealDB y relaciones entre colecciones. |
| 📂 **[CODEBASE.md](CODEBASE.md)** | Índice técnico: directorios, endpoints, env vars. |
| 🔐 **[SECRETS_MAP.md](SECRETS_MAP.md)** | Credenciales locales (no subir al repo público). |

---

## Stack Tecnológico

| Capa | Tecnología |
|---|---|
| **Frontend** | React 19 + Vite + CSS modular (`client/src/modules/*`, CSS Modules y estilos por módulo) |
| **Backend** | Rust + Axum (Tokio) — workspace modular |
| **Base de datos** | SurrealDB |
| **Proxy / SSL** | Caddy v2 (`fluency-proxy` en Oracle) |
| **IA — Tutor** | Google Gemini (gRPC) |
| **IA — Audio** | Gemini AI Studio para audio; ElevenLabs solo para `landing-demo` |
| **Auth** | Google OAuth 2.0 → JWT |

---

## Servidores de Producción

| Servidor | Rol |
|---|---|
| **Oracle** `157.151.199.170` | Caddy, SPA, backend local, assets en disco |
| **Oracle OCI-1** `10.0.1.138` | Segundo Oracle de 1 GB, dedicado solo a SurrealDB |
| **GCP Cloud Run** | Overflow del backend cuando el Oracle Proxy queda bajo el umbral de RAM |
| **AWS** | Espejo adicional vía pipeline |

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
