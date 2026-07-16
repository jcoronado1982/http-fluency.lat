# Contexto operativo obligatorio para IA y mantenimiento

> Fuente de verdad de entrada para cualquier sesión que cambie infraestructura, rendimiento,
> caché, imágenes, audio, Caddy o pipeline. Última revisión: **14 de julio de 2026**.
>
> Este archivo explica primero las restricciones reales. Los detalles de implementación viven en
> los documentos enlazados; no se debe proponer una optimización basándose solo en nombres de
> archivos, comentarios históricos o una arquitectura típica de nube.

## Orden de lectura y precedencia

1. Este documento: topología vigente, presupuesto de recursos y reglas de decisión.
2. [`server_inventory.md`](server_inventory.md): IPs, RAM, CPU, proveedor por máquina —
   **primera fuente; nunca SSH para datos que ya cubre** (regla doc-first de `CLAUDE.md` raíz).
3. [`media-delivery-cache.md`](media-delivery-cache.md): versionado, Cloudflare, Caddy, navegador,
   imágenes/audio, precarga y cancelación.
4. [`oracle-local-backend-deploy.md`](oracle-local-backend-deploy.md): runtime del proxy Oracle.
5. [`ARQUITECTURA_ORACLE_DB.md`](ARQUITECTURA_ORACLE_DB.md): segundo Oracle y SurrealDB.
6. [`pipeline-and-deploy.md`](pipeline-and-deploy.md): compilación, staging y despliegue.
7. [`wireguard-aws-oracle.md`](wireguard-aws-oracle.md): túnel privado AWS↔Oracle (10.10.0.0/30).
8. Código ejecutable: `azure-pipelines.yml`, `infra/proxy/Caddyfile` e `infra/proxy/*.sh`.

Si la documentación contradice el código ejecutable, **no se debe elegir silenciosamente uno**:
se verifica el runtime, se corrige la documentación en el mismo cambio y se registra la fecha. Los
documentos de incidentes e historiales explican el pasado; no prevalecen sobre esta lista.

## Arquitectura real: son dos Oracle de 1 GB

| Nodo | Recursos y rol vigente | No debe recibir |
|---|---|---|
| Oracle Proxy `157.151.199.170` / `10.0.1.67` | ~968 MB RAM, 2 vCPU, Alpine. Caddy, backend Rust de producción, backend QA cuando está desplegado y disco de media/JSON. | Compilación Rust/Vite, SurrealDB, caché binaria de medios en el backend, procesos por cada asset. |
| Oracle OCI-1 `129.158.214.227` / `10.0.1.138` | ~968 MB RAM, 1 vCPU, Alpine. **Solo SurrealDB 1.5.5** en `:8080`, límite Docker `800m`. | Caddy, backend Rust, generación de imagen/audio, compilación. |

La RAM de ambos nodos no se suma para un proceso: son máquinas separadas. Mover trabajo de una a
otra requiere red y cambia el riesgo; no convierte el sistema en una máquina de 2 GB.

El PC `LocalBuild` (~30 GB RAM) compila frontend y backend. Oracle solo recibe artefactos, hace
`docker pull`/`docker run`, sincroniza archivos y sirve tráfico. Esta separación es deliberada.

## Ruta del tráfico

```text
Producción
Usuario → Cloudflare → Caddy en Oracle Proxy
                     ├─ SPA/HTML/JS/CSS → disco
                     ├─ /card_images y /card_audio → disco local, file_server
                     ├─ /json → disco local, file_server browse + compresión
                     └─ /api → backend Rust local si /tmp/ORACLE_HEALTHY existe
                               └─ GCP Cloud Run si el monitor detecta presión de RAM

Persistencia
Backend Rust → SurrealDB 10.0.1.138:8080 por VCN privada → Oracle OCI-1

QA
Usuario → qa.fluency.lat DNS-only → Caddy Oracle directo, sin proxy/caché/WAF de Cloudflare
```

`/tmp/ORACLE_HEALTHY` lo gestiona `oracle-ram-monitor.sh`; el umbral vigente es más de 250 MB
libres. El `X-Backend` de la respuesta permite distinguir `Oracle-Local` de `GCP-Overflow`.

## Presupuesto de RAM y CPU

| Proceso/contenedor | Techo vigente | Observación |
|---|---:|---|
| Backend Rust producción, Oracle Proxy | `512m` | Incluye resolución/generación; el límite protege a Caddy de un OOM global. |
| Caddy, Oracle Proxy | `384m` | Uso observado muy inferior; sirve archivos desde disco. |
| Backend QA, Oracle Proxy | `128m`, `cpu-shares=128` | Solo cuando QA está desplegado; cede CPU a producción bajo contención. |
| SurrealDB, Oracle OCI-1 | `800m` | Vive solo en el segundo Oracle, no compite con Caddy/Rust. |

Los límites Docker son **techos, no reservas**. Que su suma supere la RAM física no significa que
esa memoria esté asignada permanentemente. El host Proxy tiene swap como protección, pero usarla de
forma sostenida degrada latencia y no sustituye RAM.

Reglas obligatorias para este presupuesto:

- No compilar, convertir catálogos completos ni ejecutar `docker buildx` en Oracle.
- No guardar bytes completos de imágenes/audio en mapas del backend ni en `Blob` de JavaScript.
- No crear un proceso, SSH/SCP o hash completo por cada descarga.
- No aumentar límites porque “hay memoria libre” sin medir RSS, picos, swap y latencia bajo carga.
- No precargar varias tarjetas: solo la siguiente imagen y el siguiente audio existentes.
- No generar media durante precarga. Un `404` termina la anticipación.
- Mantener rotación Docker `10m × 2`; el disco también es un recurso finito.

## Dónde existe caché y quién hace qué

| Capa | Qué conserva | Política actual |
|---|---|---|
| Backend Rust | Solo metadatos pequeños/acotados; **no bytes de media** | Calcula/resuelve `?v=` con metadatos. |
| Caddy | No hay caché de aplicación configurada | `file_server` lee el archivo del volumen; entrega ETag/Last-Modified y headers. |
| Kernel Linux | Page cache normal y recuperable | Puede usar RAM libre para acelerar disco; el kernel la libera bajo presión. No es una copia administrada por la app. |
| Cloudflare edge | Imágenes/audio de producción versionados | Cache Rule `Media versionada`; el origen solicita 1 año mediante `Cloudflare-CDN-Cache-Control`. |
| Navegador | Caché HTTP | La identidad cambia con `?v=`; no se guardan catálogos binarios en RAM JavaScript. |

Cloudflare no almacena los archivos originales como fuente de verdad. La fuente de verdad continúa
siendo `/root/smart-proxy/repository/flashcard` en Oracle Proxy. Un `MISS` lee Oracle; un `HIT` lo
sirve el edge. Las copias antiguas pueden permanecer hasta su expulsión, pero dejan de solicitarse
cuando cambia `?v=`.

## Invariante de actualización de imágenes y audio

Los nombres físicos pueden permanecer iguales. El backend devuelve, por ejemplo:

```text
/card_images/.../tarjeta.avif?v=<mtime-nanosegundos>-<tamaño>
/card_audio/.../tarjeta.ogg?v=<mtime-nanosegundos>-<tamaño>
```

Al sobrescribir el archivo, debe cambiar su metadata y por tanto la URL. No se regenera el resto del
catálogo, no se calcula hash del contenido y no se purga toda Cloudflare. Antes de modificar esta
estrategia, leer la explicación y los fallbacks en `media-delivery-cache.md`.

La cache key de Cloudflare debe incluir la query completa. **Nunca activar `Ignore Query String` ni
excluir `v`/`t`**, porque haría equivalentes versiones con bytes distintos.

## Configuración externa vigente

- Registrador: Spaceship; DNS autoritativo: Cloudflare.
- `fluency.lat` y `www.fluency.lat`: proxy naranja de Cloudflare.
- `qa.fluency.lat`: A directo al Oracle Proxy, nube gris/DNS-only.
- TLS: **Full (strict)**; Caddy conserva certificados válidos en el origen.
- Cache Rule: `Media versionada`, solo hosts de producción y paths `/card_images/` o
  `/card_audio/`, `Eligible for cache`, cache key estándar.
- No están habilitados para este flujo Cache Reserve, Cloudflare Images ni R2.
- Variable de despliegue de producción: `MEDIA_DELIVERY_MODE=cloudflare`; el rollback admite
  `oracle`, pero requiere redesplegar backend y Caddy y usar acceso directo al origen.

Observación en vivo del 14 de julio de 2026: Cloudflare respondió una AVIF versionada con
`CF-Cache-Status: MISS` y `Cache-Control: public, max-age=14400`; Caddy directo por QA respondió
`Cache-Control: public, no-cache` y
`Cloudflare-CDN-Cache-Control: public, max-age=31536000`. El valor de cuatro horas es el Browser
Cache TTL predeterminado de Cloudflare. No rompe la actualización porque cada reemplazo obtiene un
`?v=` nuevo, pero una futura sesión no debe afirmar que el header visible siempre será `no-cache`.
Si se desea revalidación estricta en el navegador, configurar Browser Cache TTL como **Respect
Existing Headers** o una Cache Response Rule específica y volver a medir; no cambiar esto por
suposición durante otro trabajo.

## Cliente: prioridad, precarga y cancelación

- La tarjeta visible siempre tiene prioridad.
- Solo después de resolver sus medios se anticipan la imagen y el audio existentes de la tarjeta
  siguiente.
- Cambiar rápido de tarjeta aborta resolución/descarga anterior y descarta respuestas tardías.
- La precarga usa solo endpoints `resolve-*`; nunca `generate-image` ni `synthesize-speech`.
- JavaScript conserva como máximo 24 entradas pequeñas de metadatos con TTL; los bytes pertenecen a
  la caché HTTP del navegador.
- El estudio normal y `landing-demo` comparten esta política. No corregir uno dejando el otro atrás.

## Pipeline: qué copia y cuánto cuesta

El pipeline actual transfiere en cada despliegue todo `json/` a
`/tmp/flashcard-json-staging` mediante `CopyFilesOverSSH`; después `sync-json-to-oracle.sh` hace
`rsync -a --update` al repositorio definitivo sin borrar decks exclusivos de Oracle. En el run 279
se transfirieron 2.978 archivos (~46 MB) y el staging tardó ~12 minutos, aunque el `rsync` final tomó
unos 3 segundos. También transfiere los 157 audios de `landing-demo` (~25 segundos). No copia todo
el catálogo normal de imágenes/audio.

Este staging completo es un costo conocido del pipeline, no carga del usuario ni caché de Caddy.
Optimizarlo es una tarea separada: primero se debe preservar el manifiesto generado, la semántica
sin `--delete`, los decks solo presentes en Oracle y la capacidad de recuperación. No sustituirlo
por un borrado/sync agresivo para ahorrar minutos.

La verificación del origen debe conectar con:

```bash
curl -skI --resolve fluency.lat:443:127.0.0.1 \
  'https://fluency.lat/card_images/<archivo>?v=pipeline-check'
```

`Host: fluency.lat` sobre `https://127.0.0.1` no conserva SNI y produjo el falso fallo del run 279.
El commit `59f2eab7` corrigió ese guard. La prueba solo hace `HEAD`; no carga media en RAM.

## Protocolo antes de “optimizar”

Una IA o persona debe responder estas preguntas con evidencia antes de cambiar código:

1. ¿El tiempo está en resolver metadatos, descargar bytes, decodificar, generar IA, DB o pipeline?
2. ¿La medición atravesó Cloudflare, QA directo, localhost o un backend remoto?
3. ¿Se midieron RSS, swap, CPU, red y número de solicitudes, o solo percepción visual?
4. ¿El cambio agrega bytes/procesos/cachés por usuario y cuánto consume con 100 usuarios?
5. ¿Respeta actualización bajo el mismo nombre y conserva la query `?v=`?
6. ¿Afecta estudio normal y demo? ¿Cancela trabajo abandonado?
7. ¿Funciona en `oracle` y `cloudflare` o rompe el puerto/adaptador hexagonal?
8. ¿La ganancia compensa complejidad, riesgo de OOM, contenido stale y costo externo?

Una optimización no es correcta solo porque reduce latencia en una máquina grande. Para este sistema
debe reducir o acotar trabajo sin trasladar un costo ilimitado a RAM, CPU, Oracle, generación IA o
facturación. Si no hay medición, primero instrumentar o reproducir; no agregar una caché nueva.

## Verificación mínima después de un cambio

1. `curl https://fluency.lat/api/health`: 200, `server: cloudflare`, `X-Backend` conocido.
2. `curl https://qa.fluency.lat/api/health`: 200 directo Caddy cuando QA está desplegado.
3. Repetir una URL versionada real: `CF-Cache-Status` debe pasar normalmente de `MISS` a `HIT`.
4. Sobrescribir un archivo de prueba o comparar metadata: resolver de nuevo debe producir otro
   `?v=` y mostrar bytes nuevos sin regenerar el catálogo.
5. Confirmar en ambos contenedores el mismo `MEDIA_DELIVERY_MODE`.
6. Navegar rápido: solicitudes anteriores canceladas; ninguna generación causada por precarga.
7. Revisar RAM/swap de ambos Oracle y logs con rotación, no solo el resultado funcional.

## Errores que no se deben repetir

- Tratar los dos Oracle como una sola bolsa de RAM.
- Mover SurrealDB de OCI-1 al Proxy o usar `127.0.0.1:8001` en producción.
- Poner `SYNC_TO_ORACLE=true` u omitir `ORACLE_REPOSITORY_ONLY=false` en el backend local Oracle.
- Añadir una caché binaria en Rust/JavaScript para “igualar” la rapidez visual de una imagen.
- Hacer precarga de varias tarjetas o invocar IA durante anticipación.
- Cachear HTML, API o JSON con la regla de media.
- Ignorar query strings en Cloudflare o declarar immutable un asset sin versión.
- Purgar todo Cloudflare como procedimiento normal de actualización.
- Compilar o regenerar el catálogo completo en un servidor de 1 GB.
- Asumir que un stage lento de JSON significa que Caddy o los usuarios están consumiendo RAM.
- Validar HTTPS local solo con header `Host` y perder el SNI.

