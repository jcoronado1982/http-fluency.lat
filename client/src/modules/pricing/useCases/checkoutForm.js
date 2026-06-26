export function formatCardNumber(value) {
    return value.replace(/\D/g, '').slice(0, 16).replace(/(.{4})/g, '$1 ').trim();
}

export function formatExpiry(value) {
    const digits = value.replace(/\D/g, '').slice(0, 4);
    if (digits.length >= 3) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
    return digits;
}

export function detectCardBrand(cardNumber) {
    const normalized = cardNumber.replace(/\s/g, '');
    if (/^4/.test(normalized)) return 'visa';
    if (/^5[1-5]/.test(normalized)) return 'mastercard';
    if (/^3[47]/.test(normalized)) return 'amex';
    return null;
}

export function normalizeCheckoutField(name, value) {
    if (name === 'cardNumber') return formatCardNumber(value);
    if (name === 'expiry') return formatExpiry(value);
    if (name === 'cvv') return value.replace(/\D/g, '').slice(0, 4);
    if (name === 'docNumber') return value.replace(/\D/g, '').slice(0, 15);
    return value;
}

export function validateCheckoutForm(form, t) {
    const errors = {};
    if (!form.email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) errors.email = t.errors.email;
    if (form.name.trim().length < 3) errors.name = t.errors.name;
    const rawCard = form.cardNumber.replace(/\s/g, '');
    if (rawCard.length < 13) errors.cardNumber = t.errors.cardNumber;
    if (!form.expiry.match(/^\d{2}\/\d{2}$/)) errors.expiry = t.errors.expiry;
    if (form.cvv.length < 3) errors.cvv = t.errors.cvv;
    if (form.docNumber.length < 5) errors.docNumber = t.errors.docNumber;
    return errors;
}
