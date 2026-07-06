# Local Agent API

Proyecto independiente para usar Ollama como motor y exponer una API compatible con OpenAI para tu editor.

Objetivo:

- seleccionar modelo desde el editor
- hablarle al modelo como si fuera una API de internet
- mantener el workspace local y controlado

## Qué hace

- expone `GET /health`
- expone `GET /v1/models`
- expone `POST /v1/chat/completions`
- reenvía las peticiones a Ollama local

## Requisitos

- Ollama corriendo en `http://127.0.0.1:11434`
- Python 3

## Arranque

```bash
python3 server.py
```

## Configuración del editor

Usa la base URL:

```text
http://127.0.0.1:8000/v1
```

Con eso puedes apuntar una extensión de VS Code que hable OpenAI-compatible.

Ejemplo de lo que el editor debe ver:

- `baseUrl`: `http://127.0.0.1:8000/v1`
- `model`: `deepseek-r1:32b`
- `models endpoint`: `http://127.0.0.1:8000/v1/models`

Si la extensión permite seleccionar modelo desde un listado, tomará los nombres que devuelve Ollama.

## Variables

- `OLLAMA_URL`: URL del servidor Ollama
- `LOCAL_AGENT_PORT`: puerto del proxy API
- `LOCAL_AGENT_DEFAULT_MODEL`: modelo por defecto
- `LOCAL_AGENT_ALLOWED_MODELS`: lista separada por comas
