# Media-generation — Pipeline de generación de audio e imágenes (tooling transversal)

> No es un módulo de negocio del registry: es el **tooling** que produce los assets que consume
> el módulo flashcards (y el demo de landing). Corre en la estación **LocalBuild** (PC dev) y en
> el backend de producción bajo demanda de usuarios premium/admin.

## Propósito

Generar y mantener el catálogo de media de las tarjetas:
- **Audio**: síntesis TTS → `.ogg` (Opus) en `card_audio/`.
- **Imágenes**: generación IA → `.avif` en `card_images/`.

## Estado

- Activo. La **entrega/caché** de estos assets (Cloudflare/Caddy, `?v=`) es tema aparte:
  [`../infrastructure/media-delivery-cache.md`](../infrastructure/media-delivery-cache.md).

## Cómo funciona

### Audio (TTS)

1. `backend/mod_flashcards/src/audio_use_cases.rs` orquesta la síntesis.
2. Proveedores: **Gemini TTS** (Google AI Studio, gRPC — `GEMINI_TTS_API_KEY`, backup solo para
   batch local) enrutado por `backend/api_main/src/infrastructure/ai/routing_tts_provider.rs`;
   **ElevenLabs** exclusivamente para `landing-demo`
   (`backend/api_main/src/infrastructure/ai/elevenlabs_tts_provider.rs`).
3. Batch local: `--batch-gen-audio` (usa `GEMINI_TTS_API_KEY_BACKUP` de `backend/.env`);
   fallos en `batch_audio_failures.log`.
4. ⚠️ **`card_audio/` tiene 3 layouts de nombre conviviendo** (~5k audios legacy que se
   encuentran por búsqueda de prefijo): **jamás regenerar ni migrar en masa**.

### Imágenes (ComfyUI/Flux + Qwen)

1. `backend/mod_flashcards/src/image_use_cases.rs` orquesta el pipeline.
2. **Refinado de prompt**: Ollama (**Qwen**, `OLLAMA_URL=http://127.0.0.1:11434`) convierte la
   palabra/frase en descripción visual. Si Ollama falla, el pipeline **se detiene con error
   explícito** (sin fallback silencioso).
3. **Render**: **ComfyUI + Flux** en `http://127.0.0.1:8188` (`COMFY_URL`), instalado en
   `/home/jcoronado/Desktop/dev/ComfyUI`, servicio systemd `comfyui.service`, flag `--cache-none`.
   El render web/responsive nace en **768×512 (3:2)**.
4. **Compresión**: AVIF vía puerto `ImageCompressor` (adapter `AvifCompressor`). El formato
   canónico entregado es **768×512**; al coincidir con Flux evita el estiramiento intermedio que
   existía cuando la salida se forzaba a 896×512. La carga manual del frontend usa el mismo
   tamaño y recorte `cover` centrado.
5. Log JSONL de generaciones: `image_generation.log` (raíz del repo).
6. Tanto la generación individual (`POST /api/generate-image`) como el batch comparten proveedor
   y compresor, por lo que producen 768×512. Batch: `scripts/batch-images.sh`; limpieza de legacy:
   `scripts/prune-legacy-512-avif.py`.
7. Las salidas 896×512 creadas por el resize antiguo pueden corregirse con
   `scripts/restore-stretched-896-images.py`. El script solo selecciona esa resolución, funciona
   en dry-run por defecto y, al ejecutar, escribe un árbol paralelo 768×512 sin sobrescribir el
   origen. `--exclude-top-level landing-demo` mantiene fuera el namespace del demo. No recupera
   los bytes originales ni debe usarse sobre imágenes 896×512 legítimas.

### Hardware (estación LocalBuild — detalle en [`server_inventory.md`](../infrastructure/server_inventory.md))

- **GPU 0** RTX 5060 Ti 16 GB → ComfyUI/Flux (`CUDA_VISIBLE_DEVICES=0`).
- **GPU 1** GTX 1660 6 GB → Ollama/Qwen (override systemd
  `/etc/systemd/system/ollama.service.d/override.conf` con `CUDA_VISIBLE_DEVICES=1`).
- Esta separación resolvió los `torch.OutOfMemoryError`: no volver a poner ambos en la GPU 0.

### Subida a producción

Los assets generados localmente se suben al disco del Oracle Proxy
(`/root/smart-proxy/repository/flashcard/`), fuente de verdad de media. En producción el backend
escribe directo a disco (`SYNC_TO_ORACLE=false`); los mirrors remotos sincronizan hacia Oracle.
Reglas de RAM (nunca generar/comprimir catálogos en los servidores de 1 GB):
[`../infrastructure/AI_OPERATIONS_CONTEXT.md`](../infrastructure/AI_OPERATIONS_CONTEXT.md).

## Mapa de archivos

| Qué | Ruta |
|---|---|
| Casos de uso | `backend/mod_flashcards/src/audio_use_cases.rs`, `image_use_cases.rs`, `batch/` |
| Prompts demo | `backend/mod_flashcards/src/landing_demo_image_prompt.rs` |
| Proveedores IA | `backend/api_main/src/infrastructure/ai/` (gemini_grpc, routing_tts, elevenlabs_tts, avif_compressor…) |
| Endpoints | `backend/api_main/src/api/endpoints/generation.rs` (ver [`flashcards.md`](flashcards.md)) |
| Frontend | `client/src/components/flashcardStudy/features/useImageGeneration.js` (hook-dios, deuda #1 de `client/CLAUDE.md` §9), `client/src/adapters/` |
| Scripts | `scripts/batch-images.sh`, `scripts/prune-legacy-512-avif.py`, `scripts/restore-stretched-896-images.py` |
| Logs | `image_generation.log`, `batch_audio_failures.log`, `ollama.log`, `backend/backend.log` |

## Dependencias

- **flashcards** ([`flashcards.md`](flashcards.md)): consumidor de los assets y dueño de los endpoints.
- **landing** ([`landing.md`](landing.md)): namespace `landing-demo` (ElevenLabs).

## Cómo probar

```bash
./start.sh                       # levanta ComfyUI (8188) + backend (8081)
systemctl status ollama comfyui  # ambos servicios systemd activos
# Generar una imagen desde la UI (rol admin dev-guest) y revisar image_generation.log
tail -f image_generation.log
```
