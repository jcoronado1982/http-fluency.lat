# Registry de Módulos

Fuente de verdad humana. La implementación técnica vive en `scripts/module_registry.sh`.

Documentación completa: [docs/ARQUITECTURA_MODULAR.md](../docs/ARQUITECTURA_MODULAR.md)  
Git (`main` / `qa`) + sparse: [docs/GIT_SPARSE_WORKFLOW.md](../docs/GIT_SPARSE_WORKFLOW.md)

| Módulo registry | Frontend `id` | Variable home |
|-----------------|-----------------|---------------|
| `flashcards` | `flashcards` | `VITE_DEFAULT_MODULE=flashcards` (default) |
| `pronoun` | `pronoun` | `VITE_DEFAULT_MODULE=pronoun` |

El módulo default abre en `/` (solo dominio). Los demás usan su path (`/flashcard`, `/pronoun-practice`, etc.).

```bash
# En client/.env.development o build
VITE_DEFAULT_MODULE=flashcards   # localhost:5173/
VITE_DEFAULT_MODULE=pronoun      # práctica o referencia en /
```

## Módulos actuales

| Módulo | Backend feature | Frontend flags | Objetivo |
|--------|-----------------|----------------|----------|
| `flashcards` | `flashcards` | `VITE_ENABLE_FLASHCARDS` (opt-out) | Flashcards con progreso, imágenes AVIF y audio Opus |
| `pronoun` | `pronoun_practice` | `VITE_ENABLE_PRONOUN_REFERENCE` (opt-out) + `VITE_ENABLE_PRONOUN_PRACTICE` (opt-in) | Referencia y práctica guiada de pronombres |
| `admin` | `auth` | `VITE_ENABLE_ADMIN` (opt-out) | Panel admin y presencia (perfil sparse sin módulos de estudio) |

## Sparse-checkout (aislamiento físico para IA)

```bash
./scripts/sparse-module.sh list
./scripts/sparse-module.sh pronoun              # solo shell + pronoun
./scripts/sparse-module.sh flashcards           # solo shell + flashcards
./scripts/sparse-module.sh admin                # solo shell + admin
./scripts/sparse-module.sh flashcards pronoun   # ambos módulos
./scripts/sparse-module.sh full                 # repo completo
./scripts/sparse-module.sh status               # qué perfil está activo
```

## Build backend por módulo

```bash
# Solo pronombres
cargo build -p api_main --no-default-features --features auth,pronoun_practice

# Solo flashcards (default)
cargo build -p api_main --no-default-features --features auth,flashcards

# Solo admin
cargo build -p api_main --no-default-features --features auth
```

## Exportar entrega

```bash
./scripts/export-module.sh pronoun
./scripts/export-module.sh flashcards
```

## Validar

```bash
./scripts/validate-module.sh pronoun
```

## Shell compartido (siempre incluido en sparse/export)

- `backend/core`, `backend/api_main`
- `client/src/modules/index.js`, layout, config, auth, UI context
- `scripts/`, `modules/`, `docs/ARQUITECTURA_MODULAR.md`

Un módulo nunca se entrega sin shell: eso garantiza compilación y arranque.
