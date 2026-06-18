use crate::domain::models::subscription::SubscriptionPlan;
use crate::domain::repositories::payment::{PaymentProvider, PaymentRef};
use anyhow::{anyhow, Result};
use async_trait::async_trait;

/// Proveedor de pago Stripe.
///
/// Activado automáticamente cuando `STRIPE_SECRET_KEY` está presente en el entorno.
/// Los métodos están preparados para recibir la integración del SDK oficial de Stripe
/// (`async-stripe`) sin modificar la firma del trait ni el use case.
///
/// Para agregar el SDK cuando sea necesario:
///   cargo add async-stripe --features runtime-tokio-hyper
pub struct StripeProvider {
    secret_key: String,
}

impl StripeProvider {
    pub fn new(secret_key: String) -> Self {
        Self { secret_key }
    }

    fn price_id_for(&self, plan: &SubscriptionPlan) -> &'static str {
        // Estos IDs de precio se configurarán en el dashboard de Stripe.
        // Pueden moverse a variables de entorno: STRIPE_PRICE_MONTHLY / STRIPE_PRICE_ANNUAL.
        match plan {
            SubscriptionPlan::Monthly => "price_monthly_placeholder",
            SubscriptionPlan::Annual => "price_annual_placeholder",
        }
    }
}

#[async_trait]
impl PaymentProvider for StripeProvider {
    fn name(&self) -> &str {
        "stripe"
    }

    async fn create_customer(&self, _email: &str) -> Result<String> {
        // TODO: usar `async-stripe` → stripe::Customer::create(...)
        // Ref: https://docs.rs/async-stripe
        Err(anyhow!(
            "Stripe SDK no integrado aún. \
             Agrega `async-stripe` a Cargo.toml e implementa este método."
        ))
    }

    async fn create_subscription(
        &self,
        _customer_id: &str,
        _plan: &SubscriptionPlan,
    ) -> Result<PaymentRef> {
        // TODO: stripe::Subscription::create(...)
        Err(anyhow!(
            "Stripe SDK no integrado aún. \
             Agrega `async-stripe` a Cargo.toml e implementa este método."
        ))
    }

    async fn cancel_subscription(&self, _external_subscription_id: &str) -> Result<()> {
        // TODO: stripe::Subscription::cancel(...)
        Err(anyhow!(
            "Stripe SDK no integrado aún. \
             Agrega `async-stripe` a Cargo.toml e implementa este método."
        ))
    }

    /// Genera una Stripe Checkout Session URL para redirigir al usuario al pago.
    async fn get_checkout_url(
        &self,
        _customer_id: &str,
        plan: &SubscriptionPlan,
        return_url: &str,
    ) -> Result<String> {
        let _price_id = self.price_id_for(plan);
        let _key = &self.secret_key;
        // TODO: stripe::CheckoutSession::create(...)
        //       con mode=subscription, line_items=[{price: price_id, quantity: 1}],
        //       success_url y cancel_url derivados de return_url.
        Err(anyhow!(
            "Stripe Checkout no integrado aún. \
             Implementa este método con `async-stripe` una vez habilitado el plan de pago. \
             return_url destino: {}",
            return_url
        ))
    }
}
