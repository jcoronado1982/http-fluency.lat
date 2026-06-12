# 🛠️ Solución de Errores: Pipeline CI/CD (Migración Azure 2026-05-07)

> **Nota:** Incidentes de 2026-05-07. Para arquitectura y deploy actual (Jun 2026), leer [`pipeline-and-deploy.md`](pipeline-and-deploy.md).

Este documento detalla los fallos críticos encontrados durante la migración de la base de datos de Oracle a Azure y cómo se resolvieron para restaurar el flujo de despliegue automatizado.

## 1. Error de Conexión a Base de Datos (SSL Mode)

### Problema:
El contenedor de Cloud Run fallaba al iniciar con el error: `password authentication failed for user "postgres"`.
Aunque la contraseña era correcta, el servidor de base de datos en Azure (Alpine Native) tiene el SSL deshabilitado por defecto. El driver de Rust (`sqlx`) intenta negociar SSL si no se especifica lo contrario, lo que provocaba el rechazo de la conexión.

### Solución:
Añadir `?sslmode=disable` a la variable `DATABASE_URL` en el archivo de pipeline (`azure-pipelines.yml`) y en los entornos de producción.
```yaml
--set-env-vars "DATABASE_URL=postgresql://postgres:pass@IP:5432/db?sslmode=disable"
```

## 2. Fallo de Caché en Docker (Zombie Build)

### Problema:
El `Dockerfile` del backend utilizaba una técnica de pre-compilación de dependencias creando un `main.rs` vacío (`fn main() {}`). 
Debido a cómo Docker y Cargo gestionan las fechas de modificación de archivos (mtimes), cuando el pipeline descargaba el código real, Docker no detectaba cambios suficientes para invalidar el caché de la compilación de Rust.
**Resultado:** Se desplegaba una imagen que contenía el programa vacío original en lugar del código real. El contenedor se cerraba inmediatamente después de arrancar sin dejar logs claros de error.

### Solución:
Forzar la invalidación del caché de la aplicación en el `Dockerfile` asegurando que los archivos tengan una fecha de modificación actualizada antes del build final.
```dockerfile
COPY . .
RUN touch src/main.rs && cargo build --release
```

## 3. Error de Compilación Oculto

### Problema:
Debido al fallo de caché mencionado arriba, errores de sintaxis en el código Rust (como una importación faltante de `serde_json::json`) pasaron desapercibidos durante varios despliegues fallidos. Una vez que se corrigió el caché, estos errores impidieron el build.

### Solución:
Se añadió la macro faltante en `src/infrastructure/storage/sql_repository.rs` y se estableció como protocolo ejecutar `cargo check` localmente antes de cualquier push al pipeline.

---
**Protocolo Preventivo:**
1. Siempre verificar la conectividad DB con `psql` desde el entorno local antes de culpar al código.
2. Si un despliegue en Cloud Run falla sin logs, sospechar de un binario corrupto o vacío por caché de Docker.
3. Mantener `azure-pipelines.yml` lo más cerca posible de la versión "Gold" certificada (#20260504.6).
