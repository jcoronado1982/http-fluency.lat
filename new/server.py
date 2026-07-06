#!/usr/bin/env python3
import json
import os
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib import request as urllib_request
from urllib.error import HTTPError, URLError


OLLAMA_URL = os.getenv("OLLAMA_URL", "http://127.0.0.1:11434").rstrip("/")
PORT = int(os.getenv("LOCAL_AGENT_PORT", "8000"))
DEFAULT_MODEL = os.getenv("LOCAL_AGENT_DEFAULT_MODEL", "deepseek-r1:32b")
ALLOWED_MODELS = [
    model.strip()
    for model in os.getenv("LOCAL_AGENT_ALLOWED_MODELS", DEFAULT_MODEL).split(",")
    if model.strip()
]


def json_response(handler, status, payload):
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


def proxy_json(path, method="GET", payload=None):
    url = f"{OLLAMA_URL}{path}"
    data = None if payload is None else json.dumps(payload).encode("utf-8")
    req = urllib_request.Request(url, data=data, method=method)
    req.add_header("Content-Type", "application/json")
    with urllib_request.urlopen(req, timeout=120) as resp:
        content = resp.read().decode("utf-8")
        return resp.status, json.loads(content) if content else {}


class Handler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        return

    def do_GET(self):
        if self.path == "/health":
            return json_response(self, 200, {"ok": True, "service": "local-agent-api"})

        if self.path == "/v1/models":
            try:
                status, data = proxy_json("/api/tags")
                models = []
                for item in data.get("models", []):
                    name = item.get("name")
                    if name:
                        models.append(
                            {
                                "id": name,
                                "object": "model",
                                "created": int(time.time()),
                                "owned_by": "ollama",
                            }
                        )
                if not models:
                    models = [
                        {
                            "id": DEFAULT_MODEL,
                            "object": "model",
                            "created": int(time.time()),
                            "owned_by": "ollama",
                        }
                    ]
                return json_response(self, 200, {"object": "list", "data": models})
            except (HTTPError, URLError, TimeoutError) as exc:
                return json_response(self, 502, {"error": f"No se pudo leer Ollama: {exc}"})

        return json_response(self, 404, {"error": "not_found"})

    def do_POST(self):
        if self.path != "/v1/chat/completions":
            return json_response(self, 404, {"error": "not_found"})

        try:
            length = int(self.headers.get("Content-Length", "0"))
            raw = self.rfile.read(length) if length else b"{}"
            payload = json.loads(raw.decode("utf-8"))
            model = payload.get("model") or DEFAULT_MODEL
            if ALLOWED_MODELS and model not in ALLOWED_MODELS:
                return json_response(
                    self,
                    400,
                    {
                        "error": {
                            "message": f"Modelo no permitido: {model}",
                            "type": "invalid_request_error",
                        }
                    },
                )

            messages = payload.get("messages", [])
            temperature = payload.get("temperature", 0.2)
            stream = bool(payload.get("stream", False))

            if stream:
                return json_response(
                    self,
                    400,
                    {"error": {"message": "Streaming no implementado en este proxy", "type": "invalid_request_error"}},
                )

            ollama_payload = {
                "model": model,
                "stream": False,
                "messages": messages,
                "options": {
                    "temperature": temperature,
                    "num_ctx": payload.get("num_ctx", 8192),
                    "num_predict": payload.get("max_tokens", 1024),
                },
            }
            status, data = proxy_json("/api/chat", method="POST", payload=ollama_payload)
            content = data.get("message", {}).get("content", "")
            response = {
                "id": f"chatcmpl-{int(time.time() * 1000)}",
                "object": "chat.completion",
                "created": int(time.time()),
                "model": model,
                "choices": [
                    {
                        "index": 0,
                        "message": {"role": "assistant", "content": content},
                        "finish_reason": "stop",
                    }
                ],
            }
            return json_response(self, status, response)
        except HTTPError as exc:
            return json_response(self, 502, {"error": f"Ollama respondió error: {exc}"})
        except URLError as exc:
            return json_response(self, 502, {"error": f"No se pudo conectar con Ollama: {exc}"})
        except Exception as exc:
            return json_response(self, 500, {"error": str(exc)})


def main():
    server = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    print(f"Local Agent API listening on http://127.0.0.1:{PORT}")
    print(f"Ollama: {OLLAMA_URL}")
    print(f"Default model: {DEFAULT_MODEL}")
    server.serve_forever()


if __name__ == "__main__":
    main()

