#!/bin/bash
# Aplica json/ del repo (staging del pipeline) al repositorio de producción en Oracle.
# rsync --update: solo sube archivos nuevos o más recientes que los de disco.
set -euo pipefail

SOURCE="${1:?source json directory required}"
DEST="${2:-/root/smart-proxy/repository/flashcard/json}"

if [[ ! -d "$SOURCE" ]]; then
  echo "ERROR: directorio origen no encontrado: $SOURCE"
  exit 1
fi

mkdir -p "$DEST"

echo "Sync json/ → $DEST (incremental)..."
rsync -a --update --delete "$SOURCE/" "$DEST/"

JSON_COUNT=$(find "$DEST" -name '*.json' | wc -l | tr -d ' ')
CAT_COUNT=$(find "$DEST" -mindepth 1 -maxdepth 1 -type d | wc -l | tr -d ' ')

if [[ "$CAT_COUNT" -eq 0 ]]; then
  echo "ERROR: sin categorías en $DEST tras el sync"
  exit 1
fi

echo "JSON → Oracle OK (${JSON_COUNT} archivos, ${CAT_COUNT} categorías)"
