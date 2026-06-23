use super::connection::SurrealConnection;
use crate::domain::models::subscription::Subscription;
use crate::domain::repositories::db_repository::SubscriptionRepository;
use anyhow::{anyhow, Result};
use async_trait::async_trait;
use std::sync::Arc;

pub struct SurrealSubscriptionRepository(pub Arc<SurrealConnection>);

#[async_trait]
impl SubscriptionRepository for SurrealSubscriptionRepository {
    async fn get_subscription(&self, email: &str) -> Result<Option<Subscription>> {
        let mut res = self
            .0
            .db
            .query("SELECT * FROM type::thing('subscription', $email)")
            .bind(("email", email))
            .await?;
        let sub: Option<Subscription> = res.take(0)?;
        Ok(sub)
    }

    async fn upsert_subscription(&self, sub: Subscription) -> Result<Subscription> {
        #[derive(serde::Serialize)]
        struct SubData {
            user_email: String,
            plan: String,
            status: String,
            starts_at: chrono::DateTime<chrono::Utc>,
            expires_at: chrono::DateTime<chrono::Utc>,
            payment_provider: Option<String>,
            external_customer_id: Option<String>,
            external_subscription_id: Option<String>,
            created_at: chrono::DateTime<chrono::Utc>,
            updated_at: chrono::DateTime<chrono::Utc>,
        }

        let data = SubData {
            user_email: sub.user_email.clone(),
            plan: sub.plan,
            status: sub.status,
            starts_at: sub.starts_at,
            expires_at: sub.expires_at,
            payment_provider: sub.payment_provider,
            external_customer_id: sub.external_customer_id,
            external_subscription_id: sub.external_subscription_id,
            created_at: sub.created_at,
            updated_at: sub.updated_at,
        };

        let mut res = self
            .0
            .db
            .query(
                "
            UPDATE type::thing('subscription', $email) CONTENT $data;
            SELECT * FROM type::thing('subscription', $email);
        ",
            )
            .bind(("email", sub.user_email.clone()))
            .bind(("data", data))
            .await?;
        let updated: Option<Subscription> = res.take(1)?;
        updated.ok_or_else(|| anyhow!("Failed to upsert subscription"))
    }

    async fn list_subscriptions(&self, limit: usize, offset: usize) -> Result<Vec<Subscription>> {
        let mut res = self
            .0
            .db
            .query("SELECT * FROM subscription ORDER BY created_at DESC LIMIT $limit START $offset")
            .bind(("limit", limit))
            .bind(("offset", offset))
            .await?;
        let subs: Vec<Subscription> = res.take(0)?;
        Ok(subs)
    }

    async fn cancel_subscription(&self, email: &str) -> Result<()> {
        self.0
            .db
            .query(
                "UPDATE type::thing('subscription', $email) SET status = 'cancelled', updated_at = time::now();",
            )
            .bind(("email", email))
            .await?;
        Ok(())
    }

    async fn bulk_expire_subscriptions(&self) -> Result<usize> {
        let mut res = self
            .0
            .db
            .query(
                "UPDATE subscription SET status = 'expired', updated_at = time::now()
             WHERE status = 'active' AND expires_at < time::now();",
            )
            .await?;
        let updated: Vec<Subscription> = res.take(0).unwrap_or_default();
        Ok(updated.len())
    }
}
