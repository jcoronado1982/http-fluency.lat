# Git, ramas y sparse-checkout

## Dos conceptos distintos (no mezclar)

| Concepto | Para qué sirve | Ejemplos |
|----------|----------------|----------|
| **Rama Git** | Entorno / línea de release | `main` producción, `qa` pre-producción |
| **Perfil sparse** | Qué archivos existen en disco al desarrollar | `flashcards`, `pronoun`, `admin`, combinaciones |

Las ramas **no** sustituyen al sparse-checkout. En la misma rama `qa` puedes tener solo flashcards en disco o solo pronoun, según el script que ejecutes.

---

## Repositorio y ramas

### Remoto nuevo (http-fluency.lat)

```bash
# Si partes de cero en el repo nuevo:
git init
git add .
git commit -m "first commit"
git branch -M main
git remote add origin https://github.com/jcoronado1982/http-fluency.lat.git
git push -u origin main

# Rama pre-producción (QA)
git checkout -b qa
git push -u origin qa
```

### Flujo recomendado

```
main  ──► producción (fluency.lat)
qa    ──► pre-producción (pruebas integradas antes de merge a main)
```

Trabajo diario en `qa` o en ramas feature (`feature/...`) que mergean a `qa` y luego a `main`.

---

## Perfiles sparse (aislamiento en disco)

Fuente de verdad: `scripts/module_registry.sh`

### Comandos

```bash
# Ver perfiles
./scripts/sparse-module.sh list

# Solo un módulo + shell
./scripts/sparse-module.sh flashcards
./scripts/sparse-module.sh pronoun
./scripts/sparse-module.sh admin

# Varios módulos (A + B)
./scripts/sparse-module.sh flashcards pronoun

# Todo el repo
./scripts/sparse-module.sh full

# Estado actual
./scripts/sparse-module.sh status
```

### Wrappers rápidos

```bash
./scripts/sparse-flashcards.sh
./scripts/sparse-pronoun.sh
./scripts/sparse-admin.sh
./scripts/sparse-full.sh
```

### Qué hay en disco tras cada perfil

| Perfil | Existe en disco | No existe |
|--------|-----------------|-----------|
| `flashcards` | shell + `mod_flashcards` + `modules/flashcards` + `json/` | pronoun, práctica |
| `pronoun` | shell + `mod_pronoun` + `modules/pronounPractice` | flashcards, `json/` |
| `admin` | shell + auth + `AdminPage` | `mod_*`, módulos de estudio |
| `flashcards pronoun` | shell + ambos módulos | resto |
| `full` | repo completo | — |

La IA y el editor solo ven lo que está en disco.

---

## Build por perfil

```bash
# Flashcards
cargo build -p api_main --no-default-features --features auth,flashcards

# Pronoun
cargo build -p api_main --no-default-features --features auth,pronoun_practice

# Admin
cargo build -p api_main --no-default-features --features auth
```

Validar:

```bash
./scripts/validate-module.sh flashcards
./scripts/validate-module.sh pronoun
./scripts/validate-module.sh admin
```

### Flags frontend sugeridos

El script sparse imprime los flags al activar un perfil. Ejemplo admin:

```
VITE_ENABLE_ADMIN=true
VITE_ENABLE_FLASHCARDS=false
VITE_ENABLE_PRONOUN_REFERENCE=false
VITE_ENABLE_PRONOUN_PRACTICE=false
```

---

## Flujo típico de un desarrollador

```bash
git checkout qa
./scripts/sparse-module.sh flashcards    # solo trabajo flashcards
# ... editar, probar ...
./scripts/validate-module.sh flashcards

# Cambiar de módulo
./scripts/sparse-module.sh pronoun

# Antes de release integrado
./scripts/sparse-module.sh full
cargo check --manifest-path backend/Cargo.toml
cd client && npm run build
```

---

## Exportar entrega por módulo

```bash
./scripts/export-module.sh flashcards
./scripts/export-module.sh pronoun
```

Genera `.tar.gz` con shell + módulo para cliente o IA aislada.

---

## Preguntas frecuentes

**¿Creo una rama `flashcards` en Git?**  
No hace falta. Usa `qa` (o tu feature branch) + `./scripts/sparse-module.sh flashcards`.

**¿El sparse se sube al remoto?**  
No. Es configuración local de tu working copy. Cada clon ejecuta el script que necesite.

**¿Puedo tener A y B sin C?**  
Sí: `./scripts/sparse-module.sh flashcards pronoun`

**¿Dónde está documentada la arquitectura modular?**  
[ARQUITECTURA_MODULAR.md](ARQUITECTURA_MODULAR.md)
