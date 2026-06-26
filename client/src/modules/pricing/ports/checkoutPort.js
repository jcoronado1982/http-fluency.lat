/** Contrato de checkout (integración futura con backend de pagos). */
export function createCheckoutPort(adapter) {
    return {
        submitCheckout: (payload) => adapter.submitCheckout(payload),
    };
}
