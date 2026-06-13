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

# 2. Levantar la base de datos con Docker
echo "🚀 Levantando bases de datos en Docker..."
docker-compose up -d db

# 2.1 Levantar SurrealDB con persistencia
if [ ! -d "surreal_data" ]; then mkdir surreal_data; fi
docker run -d --rm --name surrealdb \
  -p 8001:8000 \
  -v $(pwd)/surreal_data:/data \
  surrealdb/surrealdb:v1.5.5 start --user root --pass root file:/data/surreal.db

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

# Aseguramos que esté compilado
echo "⚙️  Compilando backend en Rust (esto puede tardar si es la primera vez)..."
if ! cargo build --features story_arcade; then
    echo "❌ ERROR: cargo build falló."
    exit 1
fi

# Limpiamos la variable global para forzar que use la del .env
unset GEMINI_API_KEY

# Lanzamos el binario en segundo plano para verificarlo
RUST_MIN_STACK=8388608 ./target/debug/backend_rust &
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
