use anyhow::{anyhow, Result};
use chrono::Utc;
use fluency_core::domain::models::subscription::{Subscription, SubscriptionPlan, SubscriptionStatus};
use fluency_core::ports::db_repository::SubscriptionRepository;
use fluency_core::ports::payment::PaymentProvider;
use std::sync::Arc;

pub struct SubscriptionUseCases {
    repository: Arc<dyn SubscriptionRepository>,
    payment: Arc<dyn PaymentProvider>,
}

impl SubscriptionUseCases {
    pub fn new(
        repository: Arc<dyn SubscriptionRepository>,
        payment: Arc<dyn PaymentProvider>,
    ) -> Self {
        Self {
            repository,
            payment,
        }
    }

    /// Activa o renueva la suscripción de un usuario.
    ///
    /// Si existe suscripción activa conserva `starts_at` original y extiende `expires_at`.
    /// Si hay proveedor de pago configurado (distinto de `null`), crea el customer y la
    /// suscripción en el gateway externo, almacenando los IDs para futuros webhooks.
    pub async fn activate(&self, email: &str, plan: SubscriptionPlan) -> Result<Subscription> {
        let now = Utc::now();
        let duration = match plan {
            SubscriptionPlan::Monthly => chrono::Duration::days(30),
            SubscriptionPlan::Annual => chrono::Duration::days(365),
        };

        let existing = self.repository.get_subscription(email).await?;
        let starts_at = match &existing {
            Some(s) if s.is_active() => s.starts_at,
            _ => now,
        };

        // Registrar en el proveedor externo solo si el proveedor no es nulo.
        let (payment_provider, external_customer_id, external_subscription_id) =
            if self.payment.name() != "null" {
                let customer_id = match existing
                    .as_ref()
                    .and_then(|s| s.external_customer_id.clone())
                {
                    Some(id) => id,
                    None => self.payment.create_customer(email).await?,
                };
                let payment_ref = self
                    .payment
                    .create_subscription(&customer_id, &plan)
                    .await?;
                (
                    Some(self.payment.name().to_string()),
                    Some(customer_id),
                    Some(payment_ref.external_subscription_id),
                )
            } else {
                (
                    existing.as_ref().and_then(|s| s.payment_provider.clone()),
                    existing
                        .as_ref()
                        .and_then(|s| s.external_customer_id.clone()),
                    existing
                        .as_ref()
                        .and_then(|s| s.external_subscription_id.clone()),
                )
            };

        let sub = Subscription {
            user_email: email.to_string(),
            plan: plan.to_string(),
            status: SubscriptionStatus::Active.to_string(),
            starts_at,
            expires_at: now + duration,
            payment_provider,
            external_customer_id,
            external_subscription_id,
            created_at: existing.as_ref().map(|s| s.created_at).unwrap_or(now),
            updated_at: now,
        };

        self.repository.upsert_subscription(sub).await
    }

    /// Cancela la suscripción.
    ///
    /// Si hay proveedor externo, propaga la cancelación al gateway para detener cobros.
    /// El acceso premium se mantiene hasta `expires_at`.
    pub async fn cancel(&self, email: &str) -> Result<()> {
        let sub = self
            .repository
            .get_subscription(email)
            .await?
            .ok_or_else(|| anyhow!("No existe suscripción para {}", email))?;

        if self.payment.name() != "null" {
            if let Some(ext_id) = &sub.external_subscription_id {
                self.payment.cancel_subscription(ext_id).await?;
            }
        }

        self.repository.cancel_subscription(email).await
    }

    pub async fn get(&self, email: &str) -> Result<Option<Subscription>> {
        self.repository.get_subscription(email).await
    }

    /// Lista suscripciones con paginación. `limit` máximo recomendado: 100.
    pub async fn list_all(&self, limit: usize, offset: usize) -> Result<Vec<Subscription>> {
        self.repository
            .list_subscriptions(limit.min(100), offset)
            .await
    }

    /// Genera una URL de checkout para que el usuario pague directamente.
    /// Solo disponible cuando el proveedor no es `null`.
    pub async fn checkout_url(
        &self,
        email: &str,
        plan: SubscriptionPlan,
        return_url: &str,
    ) -> Result<String> {
        if self.payment.name() == "null" {
            return Err(anyhow!(
                "No hay proveedor de pago configurado. Contacta al administrador."
            ));
        }

        let existing = self.repository.get_subscription(email).await?;
        let customer_id = match existing.and_then(|s| s.external_customer_id) {
            Some(id) => id,
            None => self.payment.create_customer(email).await?,
        };

        self.payment
            .get_checkout_url(&customer_id, &plan, return_url)
            .await
    }

    /// Marca como `expired` en una sola operación de DB todas las suscripciones
    /// activas vencidas. Sin N+1: un único round-trip independientemente del volumen.
    pub async fn expire_stale(&self) -> Result<usize> {
        self.repository.bulk_expire_subscriptions().await
    }
}
