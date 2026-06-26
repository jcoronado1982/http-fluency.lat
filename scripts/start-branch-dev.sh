#!/usr/bin/env bash
# Arranca backend+frontend igual que dev-full (start.sh): SYNC_TO_ORACLE según .env si hay Docker.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BRANCH="${1:-}"

case "$BRANCH" in
  dev-admin) PROFILE=admin; FEATURES=auth ;;
  dev-flashcards) PROFILE=flashcards; FEATURES="auth,flashcards" ;;
  dev-pronoun) PROFILE=pronoun; FEATURES="auth,pronoun_practice" ;;
  dev-full) PROFILE=full; FEATURES="auth,flashcards,pronoun_practice" ;;
  *) echo "Uso: $0 dev-admin|dev-flashcards|dev-pronoun|dev-full" >&2; exit 1 ;;
esac

fuser -k 8081/tcp 5173/tcp 2>/dev/null || true
sleep 1

cd "$ROOT"
git checkout "$BRANCH" -q 2>/dev/null || true

if [[ "$BRANCH" == "dev-full" ]]; then
  ./scripts/sparse-module.sh full
else
  ./scripts/sparse-module.sh "$PROFILE"
  cp "client/env-profiles/${PROFILE}.profile" client/.env.development
fi

cargo build --manifest-path "$ROOT/backend/Cargo.toml" -p api_main \
  --no-default-features --features "$FEATURES" >/tmp/start-${BRANCH}-build.log 2>&1

DOCKER_READY=false
if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
  DOCKER_READY=true
fi

(
  cd "$ROOT/backend"
  export PORT=8081
  # Igual que start.sh: solo desactivar Oracle si no hay Docker.
  if [[ "$DOCKER_READY" != true ]]; then
    export SYNC_TO_ORACLE=false
  fi
  RUST_MIN_STACK=8388608 ./target/debug/api_main
) > /tmp/start-${BRANCH}-backend.log 2>&1 &

(
  cd "$ROOT/client"
  npm run dev -- --port 5173 --host 127.0.0.1
) > /tmp/start-${BRANCH}-frontend.log 2>&1 &

for i in $(seq 1 40); do
  curl -sf http://127.0.0.1:8081/api/health >/dev/null && \
  curl -sf http://127.0.0.1:5173/ >/dev/null && exit 0
  sleep 1
done
echo "timeout esperando servidores — ver /tmp/start-${BRANCH}-backend.log" >&2
exit 1
