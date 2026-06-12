use async_trait::async_trait;
use anyhow::Result;
use crate::domain::models::subscription::SubscriptionPlan;
use crate::domain::repositories::payment::{PaymentProvider, PaymentRef};

/// Proveedor de pago nulo: no interactúa con ningún gateway externo.
///
/// Es la implementación activa cuando no hay `STRIPE_SECRET_KEY` (u otra clave)
/// configurada en el entorno. Permite el flujo de activación manual por admin
/// y facilita el desarrollo local sin dependencias externas de pago.
pub struct NullPaymentProvider;

#[async_trait]
impl PaymentProvider for NullPaymentProvider {
    fn name(&self) -> &str {
        "null"
    }

    async fn create_customer(&self, _email: &str) -> Result<String> {
        Ok(String::new())
    }

    async fn create_subscription(
        &self,
        _customer_id: &str,
        _plan: &SubscriptionPlan,
    ) -> Result<PaymentRef> {
        Ok(PaymentRef {
            external_subscription_id: String::new(),
        })
    }

    async fn cancel_subscription(&self, _external_subscription_id: &str) -> Result<()> {
        Ok(())
    }

    async fn get_checkout_url(
        &self,
        _customer_id: &str,
        _plan: &SubscriptionPlan,
        _return_url: &str,
    ) -> Result<String> {
        Ok(String::new())
    }
}
