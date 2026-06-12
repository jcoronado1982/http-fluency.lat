#!/usr/bin/env bash
# Enlaza imágenes AVIF existentes → imagePath en TODOS los JSON (Oracle).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/backend"

BIN="./target/release/backend_rust"

echo "🔧 Compilando backend..."
cargo build --release 2>&1 | tail -5

echo ""
echo "========================================================"
echo "  ENLACE MASIVO — todos los mazos / todas las categorías"
echo "========================================================"
echo ""
echo "Comando que se ejecutará:"
echo "  $BIN --batch-link-images"
echo ""
echo "Opcional (un solo mazo):"
echo "  $BIN --batch-link-images adjectives 1-basic"
echo ""

read -r -p "¿Procesar TODOS los mazos? [S/n]: " CONFIRM
CONFIRM="${CONFIRM:-S}"

if [[ "$CONFIRM" =~ ^[Nn] ]]; then
    read -r -p "Categoría: " CAT
    read -r -p "Deck (vacío = todos los decks de la categoría): " DECK
    if [[ -n "$DECK" ]]; then
        "$BIN" --batch-link-images "$CAT" "$DECK"
    else
        "$BIN" --batch-link-images "$CAT"
    fi
else
    "$BIN" --batch-link-images
fi
