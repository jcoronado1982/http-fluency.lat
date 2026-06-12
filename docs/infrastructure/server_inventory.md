# 📊 Inventario de Infraestructura (Multi-Cloud)

Este documento detalla las capacidades y roles de todos los servidores activos en el ecosistema Flashcard AI.

## ☁️ Microsoft Azure
### **Worker Native (Alpine)**
- **Nombre**: `worker-alpine-native-1`
- **Resource Group**: `environment-azure`
- **Ubicación**: `southcentralus`
- **IP Pública**: `172.202.197.64` (Estática ✅)
- **IP Privada**: `10.0.0.6`
- **Rol**: Hosting de Base de Datos (Postgres), Reverse Proxy y Worker de Rust.
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
### **Backend Node (Alpine)**
- **Nombre**: `server-oci-1`
- **Ubicación**: `OCI - Ashburn (Virginia, EE.UU.)`
- **IP Pública**: `129.158.214.227` (Estática ✅)
- **Rol**: Nodo de procesamiento secundario y hosting de la aplicación (Docker).
- **Capacidades**:
  - **CPU**: 1 vCPU (AMD EPYC 7551 @ 2.0 GHz - x86_64).
  - **RAM**: 1 GB (Uso base: ~425MB con Docker | Disponible: ~550MB).
  - **Disco**: 100 GB (SSD).
  - **SO**: Alpine Linux 3.19 (Nativo via OS Takeover).
- **Docker activo**: `flashcard-backend-node` (Port 8080).
- **Acceso**: `root` / `[PROTECTED]`.

### **Reverse Proxy Server**
- **Nombre**: `server-reverse-proxy`
- **IP Pública**: `157.151.199.170` (Estática ✅)
- **Rol**: Punto de entrada único (Caddy) y terminación SSL.
- **SO**: Alpine Linux.
- **Docker activo**: `caddy-smart` (Ports 80/443).
- **Acceso**: `root` / `[PROTECTED]`.

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
- **RAM Total**: ~4.5 GB distribuidos.
- **Estrategia**: Usamos Azure como nodo principal para persistencia (DB), Proxy y procesamiento. AWS y GCP actúan como workers secundarios de Rust para alta disponibilidad y balanceo de carga, mientras que el API Server principal corre en Google Cloud Run.

---

## 🤖 Para la IA (Machine-Readable)
- **capabilities**: [infrastructure_inventory, multi_cloud_tracking, resource_allocation]
- **limitations**: [static_document, manual_updates_required_on_ip_change]
- **dependencies**: [cloud_providers: aws, azure, gcp, oci]
- **active_vms**:
    - **Azure**: worker-alpine-native-1 (172.202.197.64) | 1GB RAM | 32GB Disk
    - **AWS**: alpine-aws-01 (34.229.229.255) | 1GB RAM | 28GB Disk
    - **Oracle (Backend)**: server-oci-1 (129.158.214.227) | 1GB RAM | Alpine x86_64
    - **Oracle (Proxy)**: server-reverse-proxy (157.151.199.170) | 1GB RAM | Alpine

- **update_protocol**: Must be updated whenever an IP changes, a new VM is provisioned, or a VM is destroyed.
