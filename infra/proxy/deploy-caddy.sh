#!/bin/sh
set -e

PROXY_DIR="${PROXY_DIR:-/root/smart-proxy/infra-proxy}"
REPO_ROOT="${REPO_ROOT:-/root/smart-proxy}"

cd "$PROXY_DIR"
# stderr de BuildKit confunde la pestaña Errors en Azure; unificar streams
docker build -t fluency-proxy . 2>&1

docker rm -f caddy-smart 2>/dev/null || true
# 384m: techo generoso (uso real ~80m). Hace determinista quién reinicia
# ante presión de RAM en la caja de 968m, en vez de dejarlo al OOM killer.
CADDY_MEMORY_LIMIT="${CADDY_MEMORY_LIMIT:-384m}"
docker run -d \
  --name caddy-smart \
  --network host \
  --memory "$CADDY_MEMORY_LIMIT" \
  --memory-swap "$CADDY_MEMORY_LIMIT" \
  --log-opt max-size=10m \
  --log-opt max-file=2 \
  -v "$REPO_ROOT/portfolio:/usr/share/caddy/portfolio" \
  -v "$REPO_ROOT/flashcard:/usr/share/caddy/flashcard" \
  -v "$REPO_ROOT/repository/flashcard:/usr/share/caddy/repository" \
  -v "$REPO_ROOT/qa_flashcard:/usr/share/caddy/qa_flashcard" \
  -v "$REPO_ROOT/repository/qa_flashcard:/usr/share/caddy/qa_repository" \
  -v caddy_data:/data \
  -v caddy_config:/config \
  -v /tmp:/tmp \
  --restart always \
  fluency-proxy

echo "Caddy deploy OK"
