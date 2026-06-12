#!/bin/bash
set -euo pipefail

CONTAINER="${SURREAL_CONTAINER:-surrealdb}"
PORT="${SURREAL_PORT:-8001}"
MEMORY_LIMIT="${SURREAL_MEMORY_LIMIT:-256m}"
DATA_DIR="${SURREAL_DATA_DIR:-/root/surreal_data}"
NETWORK="${SURREAL_NETWORK:-}" # Opcional: "--network host" para AWS

echo "Ensuring SurrealDB is running with memory limit: $MEMORY_LIMIT..."
mkdir -p "$DATA_DIR"

# Comprobar si el contenedor existe y detenerlo
if docker ps -a --format '{{.Names}}' | grep -Eq "^${CONTAINER}\$"; then
  echo "Stopping and removing existing '$CONTAINER' container to apply configuration changes..."
  docker stop "$CONTAINER" 2>/dev/null || true
  docker rm "$CONTAINER" 2>/dev/null || true
fi

# Configurar red
NETWORK_FLAGS="-p ${PORT}:8000"
if [ -n "$NETWORK" ]; then
  NETWORK_FLAGS="$NETWORK"
fi

echo "Starting SurrealDB container..."
docker run -d \
  --name "$CONTAINER" \
  --user 0:0 \
  $NETWORK_FLAGS \
  --memory "$MEMORY_LIMIT" \
  --restart always \
  -v "$DATA_DIR:/data" \
  surrealdb/surrealdb:v1.5.5 \
  start --user root --pass root file:/data/surreal.db

echo "SurrealDB deployed successfully."
