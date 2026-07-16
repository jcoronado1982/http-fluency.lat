# Fluency

Plataforma de aprendizaje de idiomas (antes Flashcard AI). Flashcards con IA, práctica guiada de pronombres, tutor gramatical y despliegue en [fluency.lat](https://fluency.lat).

> **📌 Desarrolladores e IAs: empezar por [CLAUDE.md](CLAUDE.md).**
> Contiene el protocolo de lectura obligatorio (arquitectura → módulos → código), la regla
> doc-first de infraestructura y el índice maestro de toda la documentación.

## Contrato Arquitectónico

Antes de tocar código, asume esto:

- El repo usa **arquitectura de monolito modular** con **shell compartido + módulos conectables/desconectables**.
- La app debe poder correr con **solo el shell y los módulos activos**.
- Los módulos se controlan por `registry`, `Cargo features`, `Vite flags` y `git sparse-checkout`.
- Si un módulo no está en disco o no está habilitado, la aplicación no debe romperse; solo debe omitirlo.
- El `sparse-checkout` existe también para aislar contexto de IA: la IA debe ver solo el módulo en el que trabaja más el shell.

Documento canónico: [docs/ARQUITECTURA_MODULAR.md](docs/ARQUITECTURA_MODULAR.md)

## Stack Tecnológico

| Capa | Tecnología |
|---|---|
| **Frontend** | React 19 + Vite + CSS modular (`client/src/modules/*`, CSS Modules y estilos por módulo) |
| **Backend** | Rust + Axum (Tokio) — workspace modular |
| **Base de datos** | SurrealDB 1.5.5 |
| **Proxy / SSL** | Caddy v2 (`caddy-smart` en Oracle) |
| **IA — Tutor** | Google Gemini (gRPC) |
| **IA — Audio** | Gemini AI Studio para audio; ElevenLabs solo para `landing-demo` |
| **IA — Imágenes** | ComfyUI/Flux local + Qwen (Ollama) para refinado de prompts |
| **Auth** | Google OAuth 2.0 → JWT |

## Arranque rápido

```bash
# Salud de la API en producción
curl -s https://fluency.lat/api/health

# Stack local completo (DB Docker + ComfyUI + backend + Vite)
./start.sh              # modos: local (default) | oracle | remoto

# Trabajo por módulo (sparse-checkout)
./scripts/sparse-module.sh list
./scripts/sparse-module.sh flashcards
```

## Documentación

Todo el índice vive en **[CLAUDE.md](CLAUDE.md)**. Atajos más usados:

| Tema | Documento |
|---|---|
| Protocolo de lectura + índice maestro | [CLAUDE.md](CLAUDE.md) |
| Arquitectura modular | [docs/ARQUITECTURA_MODULAR.md](docs/ARQUITECTURA_MODULAR.md) |
| Registry de módulos | [modules/README.md](modules/README.md) |
| Docs por módulo | [docs/modules/](docs/modules/) |
| Servidores (IPs, RAM, CPU, proveedor) | [docs/infrastructure/server_inventory.md](docs/infrastructure/server_inventory.md) |
| Restricciones operativas (leer antes de optimizar) | [docs/infrastructure/AI_OPERATIONS_CONTEXT.md](docs/infrastructure/AI_OPERATIONS_CONTEXT.md) |
| Pipeline CI/CD | [docs/infrastructure/pipeline-and-deploy.md](docs/infrastructure/pipeline-and-deploy.md) |
