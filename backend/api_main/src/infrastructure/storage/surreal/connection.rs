use anyhow::{anyhow, Result};
use surrealdb::engine::remote::ws::{Client, Ws};
use surrealdb::opt::auth::Root;
use surrealdb::Surreal;

#[derive(Clone)]
pub struct SurrealConnection {
    pub db: Surreal<Client>,
}

impl SurrealConnection {
    pub async fn new(endpoint: &str, namespace: &str, database: &str) -> Result<Self> {
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
        tracing::info!(
            "🚀 Conectado a SurrealDB (RocksDB) en {} (NS: {}, DB: {})",
            endpoint,
            namespace,
            database
        );

        Ok(Self { db })
    }
}
