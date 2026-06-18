#!/usr/bin/env bash

set -euo pipefail

MODULE_NAMES=(
  flashcards
  pronoun
  admin
)

module_exists() {
  local module="${1:-}"
  local item
  for item in "${MODULE_NAMES[@]}"; do
    if [[ "$item" == "$module" ]]; then
      return 0
    fi
  done
  return 1
}

module_description() {
  case "${1:-}" in
    flashcards) echo "Flashcards base con imagenes/audio AVIF/Opus y progreso" ;;
    pronoun) echo "Referencia y practica guiada de pronombres" ;;
    admin) echo "Panel admin, auth y presencia (shell sin modulos de estudio)" ;;
    *) return 1 ;;
  esac
}

module_backend_feature() {
  case "${1:-}" in
    flashcards) echo "flashcards" ;;
    pronoun) echo "pronoun_practice" ;;
    admin) echo "auth" ;;
    *) return 1 ;;
  esac
}

module_cargo_features() {
  local module="${1:-}"
  local features="auth"
  if module_exists "$module"; then
    features+=",$(module_backend_feature "$module")"
  fi
  echo "$features"
}

module_cargo_features_multi() {
  local features="auth"
  local module feat
  for module in "$@"; do
    if module_exists "$module"; then
      feat="$(module_backend_feature "$module")"
      if [[ ",$features," != *",$feat,"* ]]; then
        features+=",$feat"
      fi
    fi
  done
  echo "$features"
}

module_cargo_build_args() {
  local module="${1:-}"
  printf '%s' "--no-default-features --features $(module_cargo_features "$module")"
}

module_cargo_build_args_multi() {
  printf '%s' "--no-default-features --features $(module_cargo_features_multi "$@")"
}

module_frontend_flag() {
  case "${1:-}" in
    flashcards) echo "VITE_ENABLE_FLASHCARDS=true" ;;
    pronoun) echo "VITE_ENABLE_PRONOUN_REFERENCE=true VITE_ENABLE_PRONOUN_PRACTICE=true" ;;
    admin) echo "VITE_ENABLE_ADMIN=true VITE_ENABLE_FLASHCARDS=false VITE_ENABLE_PRONOUN_REFERENCE=false VITE_ENABLE_PRONOUN_PRACTICE=false" ;;
    *) return 1 ;;
  esac
}

module_default_home() {
  echo "flashcards"
}

module_frontend_disable_flag() {
  case "${1:-}" in
    flashcards) echo "VITE_ENABLE_FLASHCARDS=false" ;;
    pronoun) echo "VITE_ENABLE_PRONOUN_REFERENCE=false VITE_ENABLE_PRONOUN_PRACTICE=false" ;;
    admin) echo "VITE_ENABLE_ADMIN=false" ;;
    *) return 1 ;;
  esac
}

shared_sparse_patterns() {
  cat <<'EOF'
README.md
CODEBASE.md
docs/ARQUITECTURA_MODULAR.md
modules
scripts
backend/Cargo.toml
backend/Cargo.lock
backend/api_main
backend/core
client/bun.lock
client/eslint.config.js
client/index.html
client/package-lock.json
client/package.json
client/public
client/src/App.css
client/src/App.jsx
client/src/assets
client/src/components/common
client/src/components/layout
client/src/config
client/src/context/AppContext.jsx
client/src/context/AuthContext.jsx
client/src/context/UIContext.jsx
client/src/hooks
client/src/index.css
client/src/main.jsx
client/src/modules/index.js
client/src/pages/AdminPage.css
client/src/pages/AdminPage.jsx
client/src/pages/GrammarPage.jsx
client/src/pages/LoginPage.css
client/src/pages/LoginPage.jsx
client/src/pages/TestPage.jsx
client/src/services/httpClient.js
client/src/repositories/AuthRepository.js
client/src/repositories/adminRepository.js
client/src/utils
client/vite.config.js
docker-compose.yml
start.sh
EOF
}

module_sparse_patterns() {
  case "${1:-}" in
    flashcards)
      cat <<'EOF'
backend/mod_flashcards
client/src/features/flashcards
client/src/modules/flashcards
client/src/repositories/imageRepository.js
client/src/repositories/audioRepository.js
json
EOF
      ;;
    pronoun)
      cat <<'EOF'
backend/mod_pronoun
client/src/features/reference
client/src/modules/pronounPractice
client/src/pages/CoursePage.css
client/src/pages/CoursePage.jsx
EOF
      ;;
    admin)
      # Admin vive en el shell; sin mod_flashcards ni mod_pronoun
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

module_all_patterns() {
  local module
  shared_sparse_patterns
  for module in "$@"; do
    module_sparse_patterns "$module"
  done
}

print_modules_table() {
  local module
  printf '%-12s | %-22s | %s\n' "modulo" "backend_feature" "descripcion"
  printf '%-12s-+-%-22s-+-%s\n' "------------" "----------------------" "---------------------------------------------"
  for module in "${MODULE_NAMES[@]}"; do
    printf '%-12s | %-22s | %s\n' \
      "$module" \
      "$(module_backend_feature "$module")" \
      "$(module_description "$module")"
  done
}
