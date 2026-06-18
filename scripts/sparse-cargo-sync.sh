#!/usr/bin/env bash
# Ajusta Cargo.toml al perfil sparse activo y poda carpetas de modulos inactivos.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

source "$SCRIPT_DIR/module_registry.sh"

sparse_restore_cargo_from_git() {
  git -C "$REPO_ROOT" show HEAD:backend/Cargo.toml > "$REPO_ROOT/backend/Cargo.toml"
  git -C "$REPO_ROOT" show HEAD:backend/api_main/Cargo.toml > "$REPO_ROOT/backend/api_main/Cargo.toml"
}

sparse_patch_workspace_members() {
  local modules=("$@")
  local members_line
  members_line="$(module_workspace_members "${modules[@]}")"
  local ws="$REPO_ROOT/backend/Cargo.toml"
  sed -i "s|^members = \[.*\]|members = [${members_line}]|" "$ws"
}

sparse_patch_api_main() {
  local modules=("$@")
  local api="$REPO_ROOT/backend/api_main/Cargo.toml"
  local tmp
  tmp="$(mktemp)"

  cp "$api" "$tmp"

  if ! module_selected_contains flashcards "${modules[@]}"; then
    sed -i '/^mod_flashcards = /d' "$tmp"
    sed -i '/^flashcards = /d' "$tmp"
    sed -i 's/default = \["flashcards", "auth"\]/default = ["auth"]/' "$tmp"
    sed -i 's/default = \["auth", "flashcards"\]/default = ["auth"]/' "$tmp"
  fi

  if ! module_selected_contains pronoun "${modules[@]}"; then
    sed -i '/^pronoun_practice = /d' "$tmp"
    sed -i '/^pronoun_practice = \[/d' "$tmp"
  fi

  if module_selected_contains pronoun "${modules[@]}" \
    && ! module_selected_contains flashcards "${modules[@]}"; then
    sed -i 's/default = \["flashcards", "auth"\]/default = ["auth", "pronoun_practice"]/' "$tmp"
  elif module_selected_contains admin "${modules[@]}" \
    && [[ "${#modules[@]}" -eq 1 ]]; then
    sed -i 's/default = \["flashcards", "auth"\]/default = ["auth"]/' "$tmp"
  fi

  mv "$tmp" "$api"
}

sparse_prune_inactive_modules() {
  local active=("$@")
  local module path

  for module in flashcards pronoun; do
    if module_selected_contains "$module" "${active[@]}"; then
      continue
    fi
    while IFS= read -r path; do
      [[ -z "$path" ]] && continue
      local full="$REPO_ROOT/$path"
      if [[ -e "$full" ]]; then
        rm -rf "$full"
        echo "Podado (fuera de perfil): $path"
      fi
    done < <(module_disk_paths "$module")
  done
}

sparse_sync_for_modules() {
  local modules=("$@")
  sparse_restore_cargo_from_git
  sparse_patch_workspace_members "${modules[@]}"
  sparse_patch_api_main "${modules[@]}"
  sparse_prune_inactive_modules "${modules[@]}"
}

sparse_restore_full() {
  sparse_restore_cargo_from_git
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  if [[ "${1:-}" == "full" ]]; then
    sparse_restore_full
    echo "Cargo workspace restaurado (full)."
  else
    sparse_sync_for_modules "$@"
  fi
fi
