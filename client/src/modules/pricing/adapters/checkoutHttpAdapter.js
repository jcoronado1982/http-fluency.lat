/** Adaptador stub hasta integrar Stripe/backend real. */
export function createCheckoutHttpAdapter() {
    return {
        submitCheckout: async (payload) => {
            await new Promise((resolve) => { setTimeout(resolve, 2800); });
            return { success: true, payload };
        },
    };
}
