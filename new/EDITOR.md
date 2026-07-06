# Editor Setup

Este proyecto expone una API local compatible con OpenAI para conectarla desde VS Code u otro editor.

## Endpoint

```text
http://127.0.0.1:8000/v1
```

## Modelos

La lista de modelos viene de Ollama local:

```text
http://127.0.0.1:8000/v1/models
```

## Uso típico

- arranca Ollama
- arranca `server.py`
- en el editor selecciona `deepseek-r1:32b` o el modelo que quieras
- manda tus prompts al API local

## Si tu extensión pide campos

- `apiKey`: cualquier texto, si la extensión lo exige
- `baseUrl`: `http://127.0.0.1:8000/v1`
- `model`: `deepseek-r1:32b`

