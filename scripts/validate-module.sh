#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

source "$SCRIPT_DIR/module_registry.sh"

usage() {
  cat <<'EOF'
Uso:
  ./scripts/validate-module.sh <modulo> [modulo...]

Ejecuta cargo check con las features del modulo y valida que el registry existe.
EOF
}

modules=("$@")
if [[ ${#modules[@]} -eq 0 ]]; then
  usage
  exit 1
fi

for module in "${modules[@]}"; do
  if ! module_exists "$module"; then
    echo "Modulo desconocido: $module" >&2
    exit 1
  fi
done

primary="${modules[0]}"
echo "==> Validando modulos: ${modules[*]}"

echo "==> cargo check ($(module_cargo_build_args "$primary"))"
cargo check --manifest-path "$REPO_ROOT/backend/Cargo.toml" -p api_main $(module_cargo_build_args "$primary")

echo "==> Patrones sparse"
module_all_patterns "${modules[@]}" | while IFS= read -r pattern; do
  if [[ -z "$pattern" ]]; then
    continue
  fi
  if [[ ! -e "$REPO_ROOT/$pattern" ]]; then
    echo "WARN: patron sin ruta local (puede ser normal si sparse esta activo): $pattern" >&2
  fi
done

echo "OK: validacion completada para ${modules[*]}"
