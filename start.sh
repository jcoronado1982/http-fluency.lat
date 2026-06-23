#!/bin/bash

# 1. Limpiar procesos anteriores si los hay de manera agresiva
echo "🧹 Limpiando procesos antiguos (puertos 8080, 8081, 5173 y 8188)..."
fuser -k 8080/tcp 2>/dev/null || true
fuser -k 8081/tcp 2>/dev/null || true
fuser -k 5173/tcp 2>/dev/null || true
fuser -k 8188/tcp 2>/dev/null || true
sleep 1 # Dar tiempo al kernel para liberar puertos

# Función para limpiar todo al salir
cleanup() {
    echo ""
    echo "🛑 Apagando servicios..."
    fuser -k 8080/tcp 2>/dev/null || true
    fuser -k 8081/tcp 2>/dev/null || true
    fuser -k 5173/tcp 2>/dev/null || true
    fuser -k 8188/tcp 2>/dev/null || true
    exit
}

# Capturar Ctrl+C (SIGINT) y SIGTERM
trap cleanup SIGINT SIGTERM

DOCKER_READY=false
if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
    DOCKER_READY=true
fi

if [ "$DOCKER_READY" = true ]; then
    # 2. Levantar la base de datos con Docker
    echo "🚀 Levantando bases de datos en Docker..."
    if docker ps -a --format '{{.Names}}' | grep -Fxq "flashcard-db"; then
        echo "♻️  Reciclando contenedor Docker existente: flashcard-db"
        docker rm -f flashcard-db >/dev/null 2>&1 || true
    fi
    docker-compose up -d db

    # 2.1 Levantar SurrealDB para desarrollo local.
    # En esta copia de trabajo usamos memoria para evitar fallas de permisos
    # de RocksDB sobre mounts/volúmenes del daemon Docker local.
    if docker ps -a --format '{{.Names}}' | grep -Fxq "surrealdb"; then
        echo "♻️  Reciclando contenedor Docker existente: surrealdb"
        docker rm -f surrealdb >/dev/null 2>&1 || true
    fi
    docker run -d --rm --name surrealdb \
      -p 8001:8000 \
      surrealdb/surrealdb:v1.5.5 start --user root --pass root memory

    # 3. Esperar a que las bases de datos estén listas
    echo "⏳ Esperando a que las bases de datos respondan..."
    MAX_RETRIES=30
    COUNT=0
    until PGPASSWORD=postgres psql -h localhost -U postgres -d flashcard_db -c '\q' > /dev/null 2>&1; do
      sleep 1
      COUNT=$((COUNT + 1))
      if [ $COUNT -ge $MAX_RETRIES ]; then echo "❌ Error: Postgres no respondió."; exit 1; fi
    done

    until curl -s http://localhost:8001/health > /dev/null; do
      sleep 1
      COUNT=$((COUNT + 1))
      if [ $COUNT -ge $MAX_RETRIES ]; then echo "❌ Error: SurrealDB no respondió."; exit 1; fi
    done
    echo "✅ Bases de datos listas."
else
    echo "⚠️  Docker no está disponible; continúo sin levantar bases locales."
    echo "   - El backend usará sus degradaciones internas si no encuentra DB/Oracle."
fi

# 4. Iniciar Local AI (ComfyUI) en segundo plano
echo "🤖 Iniciando AI Local (ComfyUI)..."
COMFY_DIR="/home/jcoronado/Desktop/dev/ComfyUI"
if [ -d "$COMFY_DIR" ]; then
    cd "$COMFY_DIR" || exit
    nohup python3 main.py --listen 127.0.0.1 --port 8188 > comfyui_startup.log 2>&1 &
    cd - > /dev/null
    echo "   - ComfyUI lanzado en puerto 8188."
else
    echo "⚠️  ADVERTENCIA: No se encontró el directorio de ComfyUI en $COMFY_DIR"
fi

# 5. Iniciar Frontend en segundo plano
echo "🌐 Iniciando Frontend (Vite)..."
cd client || exit
npm run dev -- --port 5173 --host 0.0.0.0 &
cd ..

# 6. Resumen de Accesos y Servicios
echo ""
echo "================================================================"
echo "🚀 FLASHCARD AI - SISTEMA COMPLETO INICIADO (RUST BACKEND)"
echo "================================================================"
echo "🖥️  FRONTEND (UI):     http://localhost:5173"
echo "🛠️  BACKEND (API):    http://localhost:8081 (RUST)"
echo "📊 DATABASE (DB):     localhost:5432 (PostgreSQL)"
echo "🤖 AI SERVICES:       Gemini, Google TTS, ComfyUI (Flux.2)"
echo "================================================================"
echo ""

# 7. Iniciar Backend Rust (Proceso persistente)
echo "🔥 [BACKEND] Iniciando Rust Backend..."
cd backend || exit

# Resolver features modulares a partir de la config local del frontend
CLIENT_ENV_FILE="../client/.env.development"
CLIENT_ENV_LOCAL="../client/.env.development.local"
AUTO_BACKEND_FEATURES=""
_env_has_pronoun() {
    grep -Eq '^VITE_ENABLE_PRONOUN_PRACTICE=true$|^VITE_ENABLE_PRONOUN=true$' "$1" 2>/dev/null
}
if [ -f "$CLIENT_ENV_LOCAL" ] && _env_has_pronoun "$CLIENT_ENV_LOCAL"; then
    AUTO_BACKEND_FEATURES="pronoun_practice"
elif [ -f "$CLIENT_ENV_FILE" ] && _env_has_pronoun "$CLIENT_ENV_FILE"; then
    AUTO_BACKEND_FEATURES="pronoun_practice"
fi

if [ -z "$BACKEND_FEATURES" ] && [ -n "$AUTO_BACKEND_FEATURES" ]; then
    BACKEND_FEATURES="$AUTO_BACKEND_FEATURES"
fi

# Aseguramos que esté compilado
echo "⚙️  Compilando backend en Rust (esto puede tardar si es la primera vez)..."
if [ -n "$BACKEND_FEATURES" ]; then
    echo "   - Features extra: $BACKEND_FEATURES"
    cargo build -p api_main --features "$BACKEND_FEATURES"
else
    echo "   - Features extra: ninguna (release estable)"
    cargo build -p api_main
fi

if [ $? -ne 0 ]; then
    echo "❌ ERROR: cargo build falló."
    exit 1
fi

# Limpiamos la variable global para forzar que use la del .env
unset GEMINI_API_KEY

# En desarrollo Vite proxya /api, /card_images y /card_audio a localhost:8081.
export PORT="${PORT:-8081}"
if [ "$DOCKER_READY" != true ]; then
    export SYNC_TO_ORACLE="false"
fi

# Lanzamos el binario en segundo plano para verificarlo
RUST_MIN_STACK=8388608 ./target/debug/api_main &
BACKEND_PID=$!

echo "⏳ Esperando a que el Backend Rust esté listo en el puerto 8081..."
COUNT=0
READY=false
while [ $COUNT -lt 30 ]; do
  if curl -s http://localhost:8081/api/health > /dev/null; then
    READY=true
    break
  fi
  sleep 2
  COUNT=$((COUNT + 1))
done

if [ "$READY" = true ]; then
    echo "✅ Backend Rust iniciado y escuchando perfectamente."
else
    echo "❌ ERROR: El backend de Rust no inició correctamente tras 60 segundos."
    kill $BACKEND_PID 2>/dev/null
    exit 1
fi

# Traer el proceso al frente para mantener el script vivo
wait $BACKEND_PID
