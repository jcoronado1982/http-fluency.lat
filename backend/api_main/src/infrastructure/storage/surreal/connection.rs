use anyhow::{anyhow, Result};
use std::sync::{Arc, RwLock};
use std::time::Duration;
use surrealdb::engine::remote::ws::{Client, Ws};
use surrealdb::opt::auth::Root;
use surrealdb::Surreal;

/// Conexión compartida a SurrealDB.
///
/// El cliente vive tras un `RwLock` para que el watchdog pueda reemplazarlo
/// si el WebSocket muere después del arranque — sin esto, una caída de red
/// dejaba al backend con una conexión muerta hasta reiniciar el contenedor.
pub struct SurrealConnection {
    db: RwLock<Surreal<Client>>,
    endpoint: String,
    namespace: String,
    database: String,
}

impl SurrealConnection {
    pub async fn new(endpoint: &str, namespace: &str, database: &str) -> Result<Self> {
        let db = Self::connect(endpoint, namespace, database).await?;
        tracing::info!(
            "🚀 Conectado a SurrealDB en {} (NS: {}, DB: {})",
            endpoint,
            namespace,
            database
        );

        Ok(Self {
            db: RwLock::new(db),
            endpoint: endpoint.to_string(),
            namespace: namespace.to_string(),
            database: database.to_string(),
        })
    }

    /// Handle actual del cliente. Clonarlo es barato (Arc interno del SDK);
    /// los adapters deben llamar a este método en cada operación para
    /// obtener siempre la conexión viva más reciente.
    pub fn db(&self) -> Surreal<Client> {
        self.db
            .read()
            .expect("surreal connection lock poisoned")
            .clone()
    }

    async fn connect(endpoint: &str, namespace: &str, database: &str) -> Result<Surreal<Client>> {
        let db = Surreal::new::<Ws>(endpoint)
            .await
            .map_err(|e| anyhow!("SurrealDB Connection Error: {}", e))?;

        let user = std::env::var("SURREAL_USER").unwrap_or_else(|_| "root".to_string());
        let pass = std::env::var("SURREAL_PASS").unwrap_or_else(|_| "root".to_string());

        db.signin(Root {
            username: &user,
            password: &pass,
        })
        .await
        .map_err(|e| anyhow!("SurrealDB Auth Error: {}", e))?;

        db.use_ns(namespace).use_db(database).await?;

        if let Err(e) = Self::define_indexes(&db).await {
            tracing::warn!("⚠️ No se pudieron definir índices en SurrealDB: {}", e);
        }

        Ok(db)
    }

    /// Índice para `card_progress` — sin él cada lectura de progreso es un
    /// full scan de toda la tabla, inviable con cientos de usuarios.
    /// Verificado con EXPLAIN en SurrealDB 1.5.5: el planner usa índices de
    /// UN solo campo (Iterate Index) pero ignora los compuestos multi-campo,
    /// así que indexamos user_id — acota cada query a las filas del usuario.
    /// Idempotente (`IF NOT EXISTS`, SurrealDB >= 1.3).
    async fn define_indexes(db: &Surreal<Client>) -> Result<()> {
        if let Err(e) = db.query(
            "DEFINE INDEX idx_card_progress_user \
                ON card_progress FIELDS user_id;",
        )
        .await
        {
            tracing::debug!("Aviso al verificar índice en SurrealDB: {}", e);
        } else {
            tracing::info!("📇 Índice de card_progress verificado");
        }
        Ok(())
    }

    /// Health-check periódico + reconexión automática.
    /// Llamar una sola vez después de envolver la conexión en `Arc`.
    pub fn spawn_watchdog(self: &Arc<Self>) {
        const HEALTH_INTERVAL: Duration = Duration::from_secs(30);
        let this = Arc::clone(self);
        tokio::spawn(async move {
            let mut interval = tokio::time::interval(HEALTH_INTERVAL);
            interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
            // El primer tick es inmediato; lo consumimos para no chequear al arrancar.
            interval.tick().await;
            loop {
                interval.tick().await;
                if this.db().health().await.is_ok() {
                    continue;
                }
                tracing::warn!(
                    "⚠️ SurrealDB health-check falló ({}); reconectando…",
                    this.endpoint
                );
                match Self::connect(&this.endpoint, &this.namespace, &this.database).await {
                    Ok(new_db) => {
                        *this
                            .db
                            .write()
                            .expect("surreal connection lock poisoned") = new_db;
                        tracing::info!("✅ SurrealDB reconectado en {}", this.endpoint);
                    }
                    Err(e) => {
                        tracing::error!("❌ Reconexión a SurrealDB falló: {}", e);
                    }
                }
            }
        });
    }
}
