# 📚 Biblioteca de Lecciones Aprendidas (Troubleshooting Library)

Este documento es una base de conocimientos dinámica de errores técnicos, bugs de infraestructura y fallos de lógica encontrados durante el desarrollo. **Cualquier IA que solucione un problema NO TRIVIAL debe registrarlo aquí.**

---

## 🛑 Incidentes de Infraestructura

### 0. Post-mortems completos (en `docs/archive/`)
- [Audio mudo en modo Oracle (`ORACLE_REPOSITORY_ONLY`)](../docs/archive/INCIDENT_REPORT_AUDIO_ORACLE_MODE_2026-07.md) — 2026-07. Lección vigente: el backend del Oracle Proxy DEBE llevar `ORACLE_REPOSITORY_ONLY=false` (el default `true` del binario rompe todo lookup por prefijo).
- [Bloqueo de IA / migración Gemini 3.1](../docs/archive/INCIDENT_REPORT_GEMINI_LEAK_2026.md) — 2026.
- [Revisión de infra/pipeline en vivo](../docs/archive/reviews/2026-07-11-revision-infra-pipeline.md) — 2026-07-11.

### 0b. Migración de pipeline a Azure (2026-05-07) — 3 lecciones
- **SSL Mode con Postgres en Alpine**: el servidor tenía SSL deshabilitado y `sqlx` negocia SSL por defecto → `password authentication failed`. Solución: `?sslmode=disable` en `DATABASE_URL`. *(Contexto histórico: Postgres ya no es la DB del producto.)*
- **Zombie Build por caché Docker**: la pre-compilación con `main.rs` vacío + mtimes hacía que Docker no invalidara la caché y desplegara el binario vacío (contenedor moría sin logs). Solución: `COPY . .` + `cargo build` directo, sin truco de mtimes.
- **Errores de compilación ocultos** tras el zombie build. Protocolo: `cargo check` local SIEMPRE antes de push; si Cloud Run falla sin logs, sospechar binario corrupto/vacío por caché.

### 1. Error de Permisos en Cloud Run (Cross-Project)
- **Fecha:** 2026-05-04
- **Error:** `ERROR: (gcloud.run.deploy) Google Cloud Run Service Agent ... must have permission to read the image...`
- **Causa:** El agente de Azure DevOps tenía un proyecto de GCP por defecto (`xrubi-fd22e`), pero la imagen estaba en otro proyecto (`launch-490115`). Al omitir el flag `--project`, `gcloud` intentaba desplegar en el proyecto equivocado.
- **Solución:** Forzar siempre el proyecto en el comando de despliegue:
  ```bash
  gcloud run deploy [SERVICE] --project $(gcpProject) --image [IMAGE] ...
  ```

### 2. Fallo de Conexión Oracle CLI (API Keys)
- **Fecha:** 2026-05-04
- **Error:** `Permission denied (publickey)` o `Invalid private key`.
- **Causa:** Rutas relativas en el archivo `~/.oci/config` o falta de permisos `600` en la llave `.pem`.
- **Solución:** Usar siempre rutas ABSOLUTAS en el config de OCI y asegurar que la llave privada no sea legible por el grupo/otros.

---

## ⚙️ Errores de Aplicación

### 3. Regeneración Infinita de Imágenes (Flashcards)
- **Fecha:** 2026-04-29
- **Error:** El sistema regeneraba imágenes de verbos irregulares en cada carga.
- **Causa:** El `imagePath` no estaba normalizado para las formas `past/participle`, causando un mismatch con el nombre en GCS.
- **Solución:** Normalizar el slug del asset antes de verificar su existencia en el repositorio de datos.

---

## 📜 Protocolo de Auto-Documentación para IAs
1. **Identificación:** Si pierdes más de 10 minutos en un error o necesitas más de 3 intentos para arreglarlo, es un candidato para la biblioteca.
2. **Registro:** Crear una nueva entrada con: **Error**, **Causa** y **Solución**.
3. **Persistencia:** Realizar un `git commit` específico para actualizar esta biblioteca.

**EL OBJETIVO ES NO TROPEZAR DOS VECES CON LA MISMA PIEDRA.**
