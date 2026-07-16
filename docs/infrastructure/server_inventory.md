# 📊 Inventario de Infraestructura (Multi-Cloud)

> **PRIMERA fuente para IPs, RAM, CPU, disco, proveedor, usuarios SSH y contenedores.**
> Prohibido conectarse por SSH a consultar el SO para datos que este documento ya cubre.
> SSH solo si este doc falla o contradice el runtime — y entonces **se actualiza aquí en el
> mismo cambio**. Reglas de decisión y presupuesto de RAM: [`AI_OPERATIONS_CONTEXT.md`](AI_OPERATIONS_CONTEXT.md).

Este documento detalla las capacidades y roles de todos los servidores activos en el ecosistema Flashcard AI (marca: Fluency).

## ☁️ Microsoft Azure
### **Worker Native (Alpine)**
- **Nombre**: `worker-alpine-native-1`
- **Resource Group**: `environment-azure`
- **Ubicación**: `southcentralus`
- **IP Pública**: `172.202.197.64` (Estática ✅)
- **IP Privada**: `10.0.0.6`
- **Rol**: Infraestructura auxiliar histórica; cualquier referencia a Postgres en este inventario debe entenderse como soporte previsto para pagos/transacciones futuras, no como base activa del producto hoy.
- **Capacidades**:
  - **CPU**: 2 vCPUs (ARM64 Ampere Altra @ 3.0 GHz).
  - **RAM**: 1 GB (Uso base: ~72MB | Libre: ~760MB).
  - **Disco**: 32 GB Standard SSD (Verificado ✅).
  - **SO**: Alpine Linux 3.19 (Nativo).
- **Acceso**: 
  - **SSH Directo**: `ssh root@172.202.197.64`
  - **Password**: `[PROTECTED]`
  - **Disponibilidad**: **24/7** (Capa gratuita de 750h/mes, cubriendo el mes completo).

---

## ☁️ Oracle Cloud (OCI)
### **Backend Node (Alpine) — PROXY**
- **Nombre**: `server-reverse-proxy`
- **IP Pública**: `157.151.199.170` (Estática ✅)
- **IP Privada VCN**: `10.0.1.67`
- **Rol**: Punto de entrada (Caddy), SSL, backend Rust prod, assets estáticos.
- **Capacidades**:
  - **CPU**: 2x AMD EPYC (x86_64).
  - **RAM**: 1 GB (~527 MB disponibles tras migración DB).
  - **Disco**: ~98 GB SSD.
  - **SO**: Alpine Linux.
- **Docker base (Jul 2026)**:
  - `caddy-smart` (Ports 80/443)
  - `flashcard-backend-node` (Port 8080, `SURREAL_URL=10.0.1.138:8080`)
  - `qa-flashcard-backend-node` (Port 8081, límite 128m) cuando la rama QA está desplegada.
- **NO corre aquí**: SurrealDB (movido a OCI-1).
- **Acceso**: `root` / `[PROTECTED]`.

### **DB Node (Alpine) — OCI-1 DEDICADO SURREALDB**
- **Nombre**: `server-oci-1` (históricamente documentado como `server-postgresql` — **no tiene Postgres**)
- **Ubicación**: `OCI - Ashburn (Virginia, EE.UU.)`
- **IP Pública**: `129.158.214.227` (Estática ✅)
- **IP Privada VCN**: `10.0.1.138`
- **Rol**: **Solo SurrealDB** (progreso flashcards, usuarios, auth).
- **Capacidades**:
  - **CPU**: 1 vCPU (AMD EPYC 7551 @ 2.0 GHz - x86_64).
  - **RAM**: 1 GB (~436 MB disponibles).
  - **Disco**: 100 GB (SSD).
  - **SO**: Alpine Linux 3.19 (Nativo via OS Takeover).
- **Docker activo (Jun 2026)**:
  - `surrealdb` (Port **8080**, `--network host`, límite **800m**)
- **NO corre aquí**: Rust, Caddy, Postgres.
- **Acceso**: `root` / `[PROTECTED]`.
- **Documentación detallada**: `docs/infrastructure/ARQUITECTURA_ORACLE_DB.md`

---


## ☁️ Google Cloud (GCP)
### **Backend (Cloud Run)**
- **URL**: `https://flashcard-backend-977952175712.us-east1.run.app`
- **Rol**: API Server escalable (Serverless).
- **Capacidades**: 
  - Escalado automático de 0 a 10 instancias.
  - Memoria: 512MB - 1GB por instancia.
- **Proyecto**: `launch-490115` (launch-490115).

### **Worker Alpine (GCP)**
- **Nombre**: `alpine-server-01`
- **Zona**: `us-east1-c`
- **IP Pública**: `35.229.65.204` (Dinámica ⚠️)
- **Rol**: Procesamiento de Backend secundario.
- **Capacidades**:
  - **CPU**: 2 vCPUs (e2-micro).
  - **RAM**: 1 GB (Uso base: ~96MB | Disponible: ~760MB).
  - **Disco**: 30 GB (PD-Standard).
- **Acceso**: `root` / `[PROTECTED]`

---

## 🖥️ Estación de compilación y generación (LocalBuild — PC dev)

- **Nombre**: agente Azure DevOps del pool `LocalBuild` (PC de desarrollo, Linux).
- **Rol**: TODA la compilación (frontend Vite/bun + `docker buildx` dual-arch del backend) y
  TODA la generación de media por lotes. Los servidores cloud de 1 GB jamás compilan ni generan.
- **Capacidades**:
  - **RAM**: ~30 GB.
  - **GPU 0**: NVIDIA RTX 5060 Ti 16 GB → **ComfyUI/Flux** (generación de imágenes), servicio
    systemd `comfyui.service` con `CUDA_VISIBLE_DEVICES=0`, puerto `127.0.0.1:8188`, flag
    `--cache-none`, instalado en `/home/jcoronado/Desktop/dev/ComfyUI`.
  - **GPU 1**: NVIDIA GTX 1660 6 GB → **Ollama/Qwen** (refinado de prompts), override systemd
    `/etc/systemd/system/ollama.service.d/override.conf` con `CUDA_VISIBLE_DEVICES=1`, puerto `127.0.0.1:11434`.
  - ⚠️ La separación por GPU resolvió OOMs de torch (jul 2026): no volver a juntar ambos en la GPU 0.
- **Servicios dev**: backend Rust :8081, Vite :5173, SurrealDB local :8001, Postgres :5432 (ver `start.sh`).
- **Cachés de build**: Bun + Docker buildx (`gcr.io/launch-490115/flashcard-backend:buildcache`).

---

## 🔒 Red privada WireGuard (AWS ↔ Oracle)

Túnel cifrado para el SCP de assets sin internet pública (~120 ms → ~25 ms).
Doc completa: [`wireguard-aws-oracle.md`](wireguard-aws-oracle.md).

| Nodo | IP pública | IP túnel |
|---|---|---|
| AWS `alpine-aws-01` | `34.229.229.255` | `10.10.0.1/30` |
| Oracle `server-reverse-proxy` | `157.151.199.170` | `10.10.0.2/30` |

Puerto UDP `51820`, interfaz `wg0`, keepalive 25 s. Setup: `infra/wireguard/setup-tunnel.sh`.

---

## 🐘 Postgres: estado real (veredicto — no reabrir sin evidencia)

- **NO es la base de datos del producto.** La DB activa es SurrealDB 1.5.5 en OCI-1.
- Postgres existe en 2 sitios: `docker-compose.yml` local (Postgres 15, contenedor
  `flashcard-db:5432`, lo levanta `start.sh` en dev) y como capacidad prevista en la VM de Azure.
- **Reservado para la futura capa de pagos/transacciones — aún sin desarrollar** (la dependencia
  `sqlx` incluso se eliminó del backend en jul 2026).
- Cualquier doc/skill que trate a Postgres como DB operativa del producto está desactualizada.

---

## ☁️ Amazon Web Services (AWS)
### **Worker Native (Alpine)**
- **Nombre**: `alpine-aws-01`
- **ID de Instancia**: `i-04c534d13578093c2`
- **Región**: `us-east-1` (Virginia)
- **IP Pública**: `34.229.229.255` (Dinámica ⚠️)
- **Rol**: Procesamiento de Backend (Rust Worker) / Backup.
- **Capacidades**:
  - **CPU**: 2 vCPUs (t3.micro).
  - **RAM**: 1 GB (Uso base: ~82MB | Disponible: ~732MB).
  - **Disco**: 28 GB (NVMe EBS).
  - **SO**: Alpine Linux (Nativo via OS Takeover).
- **Acceso**: 
  - **SSH**: `ssh -i keys/flashcard-aws-key.pem alpine@34.229.229.255`
  - **Nota**: El usuario es `alpine` o `root` dependiendo del estado del takeover.

---

## 🔐 Resumen de Recursos Totales
- **Cores Totales**: ~7-8 vCPUs Multi-Cloud.
- **RAM Total**: ~4.5 GB distribuidos; **no es memoria compartida** entre procesos.
- **Estrategia vigente**: Oracle Proxy es el punto de entrada, backend principal y disco de assets;
  el segundo Oracle (OCI-1) está dedicado a SurrealDB. El PC LocalBuild compila. GCP Cloud Run es
  overflow y AWS es espejo. Azure es infraestructura auxiliar para pagos futuros y no es la base de
  datos activa de flashcards.
- **Lectura obligatoria antes de optimizar**:
  [`AI_OPERATIONS_CONTEXT.md`](AI_OPERATIONS_CONTEXT.md).

---

## 🤖 Para la IA (Machine-Readable)
- **capabilities**: [infrastructure_inventory, multi_cloud_tracking, resource_allocation]
- **limitations**: [static_document, manual_updates_required_on_ip_change]
- **dependencies**: [cloud_providers: aws, azure, gcp, oci]
- **active_vms**:
    - **Azure**: worker-alpine-native-1 (172.202.197.64) | infraestructura auxiliar/futura | 1GB RAM
    - **AWS**: alpine-aws-01 (34.229.229.255, túnel wg 10.10.0.1) | espejo/worker | 1GB RAM
    - **Oracle (Proxy)**: server-reverse-proxy (157.151.199.170 / 10.0.1.67, túnel wg 10.10.0.2) | Caddy + Rust | 1GB RAM
    - **Oracle (DB)**: server-oci-1 (129.158.214.227 / 10.0.1.138) | SurrealDB :8080 800m | 1GB RAM
    - **LocalBuild (no cloud)**: PC dev | compilación + ComfyUI/Flux (GPU0 RTX 5060 Ti) + Ollama/Qwen (GPU1 GTX 1660) | 30GB RAM
- **architecture_doc**: docs/infrastructure/ARQUITECTURA_ORACLE_DB.md

- **update_protocol**: Must be updated whenever an IP changes, a new VM is provisioned, or a VM is destroyed.
