#!/bin/sh
set -e

PROXY_DIR="${PROXY_DIR:-/root/smart-proxy/infra-proxy}"
REPO_ROOT="${REPO_ROOT:-/root/smart-proxy}"

cd "$PROXY_DIR"
# stderr de BuildKit confunde la pestaña Errors en Azure; unificar streams
docker build -t theruby-proxy . 2>&1

docker rm -f caddy-smart 2>/dev/null || true
docker run -d \
  --name caddy-smart \
  --network host \
  -v "$REPO_ROOT/portfolio:/usr/share/caddy/portfolio" \
  -v "$REPO_ROOT/flashcard:/usr/share/caddy/flashcard" \
  -v "$REPO_ROOT/repository/flashcard:/usr/share/caddy/repository" \
  -v "$REPO_ROOT/qa_flashcard:/usr/share/caddy/qa_flashcard" \
  -v "$REPO_ROOT/repository/qa_flashcard:/usr/share/caddy/qa_repository" \
  -v caddy_data:/data \
  -v caddy_config:/config \
  -v /tmp:/tmp \
  --restart always \
  theruby-proxy

echo "Caddy deploy OK"
