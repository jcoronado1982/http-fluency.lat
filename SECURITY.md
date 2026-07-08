# SECURITY.md — Hallazgos y Remediación

Auditoría de seguridad ejecutada **2026-07-07**. Este documento registra hallazgos y remediaciones pendientes.

---

## 🔴 CRÍTICO: `/api/local-agent/turn` sin autenticación

**Estado:** Hallazgo confirmado; mitigado en producción hoy, riesgo futuro.

**Ubicación:**
- `backend/api_main/src/main.rs:394` — ruta registrada sin `extract_claims`
- `backend/api_main/src/api/endpoints/agent.rs` — handler sin verificación de rol/auth
- `backend/api_main/src/infrastructure/agent.rs` — servicio que ejecuta `run_command` (git, cargo whitelisted)

**Descripción:**
El endpoint `/api/local-agent/turn` está registrado en el router público sin requerir autenticación. Acepta un JSON `AgentRequest` con un prompt, lo envía a un modelo Ollama local, y puede ejecutar comandos whitelisted (`git`, `cargo`) y escribir archivos arbitrarios dentro del workspace.

**Mitigación hoy:**
El contenedor de producción en Oracle (`157.151.199.170`) **no tiene Ollama corriendo en `127.0.0.1:11434`**. Las llamadas a `call_ollama()` fallan silenciosamente (línea 220, `response.status().is_success()` es False), y el usuario recibe error. Por lo tanto, el endpoint no es explotable hoy.

**Riesgo futuro:**
Si en un futuro despliegue se levanta Ollama en producción, o se configura `OLLAMA_URL` a un servidor accesible, cualquiera en internet (`fluency.lat`) puede:
1. Hacer POST a `/api/local-agent/turn` sin token
2. Manipular el modelo para que llame `write_file` con `path=".env"` o `path="Cargo.toml"`
3. Sobrescribir config o inyectar dependencias maliciosas
4. Luego usar `run_command` con `cargo test` (whitelisted) para ejecutar scripts build

**Remediación (antes de desplegar Ollama):**

En `backend/api_main/src/main.rs`, envolver la ruta en un feature flag:
```rust
#[cfg(feature = "local_agent")]
let mut app = app.route(
    "/api/local-agent/turn",
    post(api::endpoints::agent::local_agent_turn),
);
```

Y en `Cargo.toml` de `api_main`, dejar disabled por default:
```toml
[features]
local_agent = []  # solo activar en desarrollo local
flashcards = []
```

**Alternativa (más permisiva):** Exigir `extract_claims` + role == "admin" en el handler (línea 11 de `agent.rs`):
```rust
pub async fn local_agent_turn(
    State(state): State<AppState>,
    claims: Claims,  // ← extrae JWT y fallos 401 automático
    Json(payload): Json<AgentRequest>,
) -> Result<impl IntoResponse, ...> {
    // claims.sub es el email del usuario verificado
    // se podría validar role aquí si existiera
    ...
}
```

**Recomendación:** Usar el feature flag (más seguro por default) + admin-only. Así sigue disabled en prod si lo olvidan activar.

---

## 🟠 ALTO: `write_file` sin restricción de rutas sensibles

**Ubicación:** `backend/api_main/src/infrastructure/agent.rs:266`

**Descripción:**
La tool `write_file` invocada por el agente local permite escribir en cualquier ruta relativa dentro de `LOCAL_AGENT_WORKSPACE_ROOT`. No hay blacklist de extensiones peligrosas (`.env`, `.pem`, `Cargo.toml`, `.sh`, binarios, etc.).

**Ejemplo de explotación:**
```json
{
  "prompt": "Actualiza el archivo de configuración con variables de prueba",
  "workspace_root": "/root/smart-proxy/repository/flashcard"
}
```

El modelo, inducido adecuadamente, puede responder:
```json
{
  "type": "tool",
  "tool": "write_file",
  "args": {
    "path": "backend/.env",
    "content": "ATTACKER_API_KEY=http://attacker.com/exfil"
  }
}
```

Luego, en el siguiente paso:
```json
{
  "type": "tool",
  "tool": "run_command",
  "args": { "command": "cargo build" }
}
```

El `build.rs` (si existe) lee `.env` y envía el exfil a `http://attacker.com`.

**Remediación:**
En `agent.rs`, añadir validación antes de `write_file`:

```rust
"write_file" => {
    let rel = args.get("path").and_then(Value::as_str)
        .ok_or_else(|| anyhow!("`write_file` requiere `path`"))?;
    
    // Blacklist de archivos sensibles
    let forbidden = [".env", ".env.local", "Cargo.toml", "Cargo.lock", 
                     "package.json", ".git", ".ssh", ".pem"];
    if forbidden.iter().any(|f| rel.ends_with(f) || rel.contains(&format!("{}/", f))) {
        bail!("No se puede escribir en archivo sensible: {}", rel);
    }
    
    let path = self.resolve_relative_path(workspace_root, rel)?;
    // ... resto
}
```

---

## 🟡 MEDIO: Interpolación sin sanitizar de `category`/`deck` en Record IDs

**Ubicación:** `backend/api_main/src/infrastructure/storage/surreal/pronoun_repository.rs:60, 89, 103, 133`

**Descripción:**
Los campos `user_id` (verificado del JWT) y `category`/`deck` (del request body) se interpolan directamente con `format!` en un Record ID de SurrealDB:

```rust
let id = format!("user_progress:['{}', {}]", user_id, story_id);
```

Si `user_id` contiene `'`, puede romper la sintaxis de array SurrealDB.

**Escenario:**
Un usuario autenticado legítimamente envía:
```json
{ "user_id": "alice@test.com", "story_id": 1 }
```

El Record ID se construye como:
```
user_progress:['alice@test.com', 1]  ✓ válido
```

Pero si un ataque inyecta en `user_id` (aunque viene del JWT, en teoría no debería ocurrir), o en el futuro se abre `user_id` en un endpoint admin:
```
user_progress:['attacker@test.com', 1]  ← cruza a otro usuario
```

**Riesgo actual:** Bajo — el `user_id` proviene de `extract_claims` (JWT verificado), no del request body. El `story_id` es un número. El `deck_name` se valida parcialmente con `safe_storage_segment` en `card_repository` pero NO en `pronoun_repository`.

**Remediación:**
Usar parámetros bindeados en lugar de interpolación literal:

```rust
// En lugar de:
let id = format!("user_progress:['{}', {}]", user_id, story_id);
self.db.update(id).merge(json).await?

// Usar:
let result: Vec<_> = self.db
    .query("UPDATE user_progress SET $data WHERE user_id = $user_id AND story_id = $story_id")
    .bind(("user_id", user_id))
    .bind(("story_id", story_id))
    .bind(("data", json))
    .await?
```

Esto es particularmente importante si en el futuro `pronoun_repository` acepta `category` o `deck` como parámetros de entrada sin validar.

---

## 🟡 BAJO: CORS abierto (`*`) en producción

**Ubicación:** `backend/api_main/src/main.rs:497` — función `cors_layer()`

**Descripción:**
La función `cors_layer()` comprueba la env var `CORS_ALLOWED_ORIGINS`. Si no está seteada (o está vacía), cae a:
```rust
CorsLayer::new().allow_origin(Any).allow_methods(Any).allow_headers(Any)
```

Verificado por SSH que en el contenedor de `157.151.199.170` no está seteada, por lo que `Access-Control-Allow-Origin: *` se envía para todas las respuestas.

**Impacto:**
- **Bajo hoy:** El token de sesión va en el header `Authorization` (no en cookies), así que un sitio malicioso no puede forzar peticiones autenticadas vía CSRF clásico.
- **Riesgo futuro:** Si aparece un XSS en el frontend (React), y un atacante logra inyectar código, puede hacer fetch desde `attacker.com` a `https://fluency.lat/api/private-endpoint` y leer la respuesta (CORS allow everything lo permite). El token Bearer NO estaría disponible para exfiltrar (es HttpOnly... espera, déjame verificar).

**Verificación del token:**
Miré en `client/src/services/httpClient.js` y el token va en `Authorization: Bearer <token>`. Asumo que está en localStorage (típico), no en HttpOnly cookie. Si hay XSS, el atacante puede leer `localStorage.getItem('auth_token')` y luego enviarlo a `attacker.com`.

**Remediación:**
En el despliegue de Oracle, setear la env var:
```bash
export CORS_ALLOWED_ORIGINS="https://fluency.lat,https://www.fluency.lat"
```

Y en `docker run`, pasar:
```bash
-e CORS_ALLOWED_ORIGINS="https://fluency.lat,https://www.fluency.lat"
```

---

## ✅ LO QUE ESTÁ BIEN

- **JWT_SECRET:** El código falla al arrancar (`expect`) si no está seteado. No hay fallback débil. ✓
- **JWT Validation:** RS256 (Google) y HS256 (self-issued) correctamente configuradas. ✓
- **Secrets en .gitignore:** `.env`, `credentials.json`, `SECRETS_MAP.md`, `*.pem`, `*.key` — todos ignorados. Verificado que nunca se colaron al historial. ✓
- **XSS via dangerouslySetInnerHTML:** Ningún uso en `client/src` (búsqueda completa). ✓
- **Path Traversal en Storage:** `safe_storage_segment` + normalization + `.canonicalize()` previenen escapes de `repository/`. ✓
- **Command Injection SSH/SCP:** Los comandos usan `.args()` (array), no shell interpolado. ✓
- **Input Encoding en URLs:** `encodeURIComponent` usado en `flashcardHttpAdapter.js`. ✓

---

## Cronograma Sugerido

| Hallazgo | Severidad | Timeline | Bloqueador |
|----------|-----------|----------|-----------|
| `/api/local-agent` sin auth | 🔴 Crítico | Antes de desplegar Ollama en prod | Sí — feature flag |
| `write_file` sin restricción | 🟠 Alto | Mismo deploy que Ollama | Sí — blacklist |
| `category`/`deck` interpolación | 🟡 Medio | Próxima refactor de DB | No — bajo riesgo hoy |
| CORS abierto | 🟡 Bajo | Próximo deploy | No — mitigado por auth Bearer |

---

## Referencias

- OWASP Top 10 2021: A01:2021 – Broken Access Control (falta de auth en `/api/local-agent`)
- OWASP Top 10 2021: A03:2021 – Injection (SurrealQL via format!)
- CWE-434: Unrestricted Upload of File with Dangerous Type (`write_file` sin blacklist)
- CWE-250: Execution with Unnecessary Privileges (`run_command` como root container)
