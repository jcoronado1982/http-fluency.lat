# Flashcard AI

Aplicación Full-Stack de aprendizaje de inglés con flashcards inteligentes. Genera imágenes y audio con IA, analiza errores gramaticales y ofrece un modo Story Arcade conversacional.

## Documentación del Sistema

| Archivo / Carpeta | Qué contiene |
|---|---|
| 📑 **[INFRASTRUCTURE.md](INFRASTRUCTURE.md)** | Infraestructura física: Servidores activos, capacidades, flujos de enrutamiento y pipeline CI/CD en producción. |
| 🏗️ **[docs/ARQUITECTURA_SISTEMA.md](docs/ARQUITECTURA_SISTEMA.md)** | Arquitectura de software: Principios de diseño (Clean Architecture y SOLID) aplicados en el Backend (Rust/Axum) y el Frontend (React). |
| 🗃️ **[database_schema_diagram.md](database_schema_diagram.md)** | Modelo de Datos: Estructura lógica y diagrama Entidad-Relación de las colecciones de SurrealDB. |
| 📂 **[CODEBASE.md](CODEBASE.md)** | Índice técnico del código: Mapeo de directorios, endpoints expuestos, almacenamiento dinámico y variables de entorno. |
| 🔐 **[SECRETS_MAP.md](SECRETS_MAP.md)** | Mapa de credenciales y llaves de desarrollo (NO subir al repositorio público). |

---

## Stack Tecnológico

| Capa | Tecnología |
|---|---|
| **Frontend** | React 19 + Vite + Tailwind CSS |
| **Backend** | Rust + Axum (Asíncrono con Tokio) |
| **Base de datos** | SurrealDB |
| **Proxy / SSL** | Caddy v2 (Dockerizado en Oracle) |
| **IA — Tutor** | Google Gemini 2.0 Flash (gRPC) |
| **IA — Audio** | Google Cloud Text-to-Speech |
| **IA — Imágenes** | ComfyUI + FLUX 2 (opcional local) |
| **Auth** | Google OAuth 2.0 → JWT firmado localmente |

---

## Servidores de Producción

| Servidor | IP / URL | Rol |
|---|---|---|
| **Oracle Proxy** | `157.151.199.170` | Balanceador Caddy, almacenamiento SCP persistente de assets (audio/imágenes) y JSONs. |
| **AWS VM** | `34.229.229.255` | Backend primario en Rust y motor SurrealDB local. |
| **GCP Cloud Run** | `flashcard-backend-977952175712.us-east1.run.app` | Servidor secundario sin estado (conmutación por error ante caídas de AWS). |

---

## Comandos Útiles

```bash
# Verificar la salud de la API en producción
curl -s https://fluency.lat/api/health
curl -sI https://fluency.lat/api/health | grep x-backend

# Sincronizar localmente los JSONs de tarjetas al proxy en Oracle
sshpass -p 'Privado01*' rsync -avz json/ root@157.151.199.170:/root/smart-proxy/repository/flashcard/json/

# Levantar todo el stack local en desarrollo
./start.sh
```
