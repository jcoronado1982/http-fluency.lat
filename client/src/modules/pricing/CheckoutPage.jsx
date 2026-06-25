import React, { useState, useEffect } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import {
    FiCheck, FiZap, FiGlobe, FiImage, FiVolume2,
    FiBook, FiArrowLeft, FiShield, FiLock, FiStar,
    FiChevronDown, FiAlertCircle,
} from 'react-icons/fi';
import { useUIContext } from '../../context/UIContext';
import LanguageSelector from '../../components/common/LanguageSelector';
import { CHECKOUT_TRANSLATIONS } from './translations';
import './CheckoutPage.css';

/* ── Datos de planes ───────────────────────────────────────────── */
const getPlanData = (t) => ({
    monthly: {
        price: 4.99,
        priceDisplay: '$4.99 USD',
        period: 'month',
        label: t.monthlyLabel,
        savingsBadge: null,
        billedAs: '$4.99 USD / month',
    },
    annual: {
        price: 42.51,
        priceDisplay: '$42.51 USD',
        period: 'year',
        label: t.annualLabel,
        savingsBadge: '29%',
        billedAs: '$42.51 USD / year',
    },
});

const getPremiumPerks = (t) => [
    { icon: <FiBook />,    text: t.step2 },
    { icon: <FiGlobe />,   text: 'Idiomas' },
    { icon: <FiImage />,   text: 'Imágenes' },
    { icon: <FiImage />,   text: 'Imágenes' },
    { icon: <FiVolume2 />, text: 'Audio' },
    { icon: <FiStar />,    text: 'Soporte' },
];

/* ── Helpers ────────────────────────────────────────────────────── */
function formatCardNumber(val) {
    return val.replace(/\D/g, '').slice(0, 16).replace(/(.{4})/g, '$1 ').trim();
}
function formatExpiry(val) {
    const digits = val.replace(/\D/g, '').slice(0, 4);
    if (digits.length >= 3) return digits.slice(0, 2) + '/' + digits.slice(2);
    return digits;
}
function detectCardBrand(num) {
    const n = num.replace(/\s/g, '');
    if (/^4/.test(n)) return 'visa';
    if (/^5[1-5]/.test(n)) return 'mastercard';
    if (/^3[47]/.test(n)) return 'amex';
    return null;
}

/* ── Componente de badge de marca ──────────────────────────────── */
function CardBrandBadge({ brand }) {
    if (!brand) return null;
    const labels = { visa: 'VISA', mastercard: 'MC', amex: 'AMEX' };
    return <span className={`checkout-brand-badge checkout-brand-badge--${brand}`}>{labels[brand]}</span>;
}

/* ── Componente principal ──────────────────────────────────────── */
export default function CheckoutPage() {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const { language = 'en', setLanguage } = useUIContext();
    const t = CHECKOUT_TRANSLATIONS[language === 'es' ? 'es' : 'en'];
    const PLAN_DATA = getPlanData(t);
    const PREMIUM_PERKS = getPremiumPerks(t);

    /* billing param desde URL: ?billing=annual | monthly */
    const initBilling = searchParams.get('billing') === 'monthly' ? 'monthly' : 'annual';
    const [billing, setBilling] = useState(initBilling);
    const plan = PLAN_DATA[billing];

    /* form state */
    const [form, setForm] = useState({
        email: '',
        name: '',
        cardNumber: '',
        expiry: '',
        cvv: '',
        docType: 'cc',
        docNumber: '',
        country: 'CO',
    });
    const [errors, setErrors] = useState({});
    const [step, setStep] = useState('form'); // 'form' | 'processing' | 'success'
    const [showOrderSummary, setShowOrderSummary] = useState(false);

    /* --- card brand detect --- */
    const cardBrand = detectCardBrand(form.cardNumber);

    /* --- update billing in URL without full nav --- */
    useEffect(() => {
        const url = new URL(window.location.href);
        url.searchParams.set('billing', billing);
        window.history.replaceState({}, '', url.toString());
    }, [billing]);

    /* ── Handlers ─────────────────────────────────────────────── */
    function handleChange(e) {
        const { name, value } = e.target;
        let processed = value;

        if (name === 'cardNumber') processed = formatCardNumber(value);
        if (name === 'expiry') processed = formatExpiry(value);
        if (name === 'cvv') processed = value.replace(/\D/g, '').slice(0, 4);
        if (name === 'docNumber') processed = value.replace(/\D/g, '').slice(0, 15);

        setForm((prev) => ({ ...prev, [name]: processed }));
        setErrors((prev) => ({ ...prev, [name]: '' }));
    }

    function validate() {
        const errs = {};
        if (!form.email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) errs.email = 'Correo inválido';
        if (form.name.trim().length < 3) errs.name = 'Escribe tu nombre completo';
        const rawCard = form.cardNumber.replace(/\s/g, '');
        if (rawCard.length < 13) errs.cardNumber = 'Número de tarjeta inválido';
        if (!form.expiry.match(/^\d{2}\/\d{2}$/)) errs.expiry = 'Fecha inválida (MM/AA)';
        if (form.cvv.length < 3) errs.cvv = 'CVV inválido';
        if (form.docNumber.length < 5) errs.docNumber = 'Documento requerido';
        return errs;
    }

    function handleSubmit(e) {
        e.preventDefault();
        const errs = validate();
        if (Object.keys(errs).length > 0) {
            setErrors(errs);
            return;
        }
        setStep('processing');
        /* Simulación — aquí irá la integración real con el backend */
        setTimeout(() => setStep('success'), 2800);
    }

    /* ── Render: Success ─────────────────────────────────────── */
    if (step === 'success') {
        return (
            <div className="checkout-page">
                <div className="checkout-bg-glow" aria-hidden />
                <div className="checkout-success-wrap">
                    <div className="checkout-success-icon">
                        <FiCheck size={40} />
                    </div>
                    <h1>{t.successTitle}</h1>
                    <p>{t.successSub}</p>
                    <button
                        className="checkout-submit-btn"
                        onClick={() => navigate('/dashboard')}
                        style={{ marginTop: '2rem' }}
                    >
                        {t.goDashboard} <FiZap size={16} />
                    </button>
                </div>
            </div>
        );
    }

    /* ── Render: Processing ──────────────────────────────────── */
    if (step === 'processing') {
        return (
            <div className="checkout-page">
                <div className="checkout-bg-glow" aria-hidden />
                <div className="checkout-processing-wrap">
                    <div className="checkout-spinner" aria-label="Procesando pago" />
                    <h2>{t.processing}</h2>
                </div>
            </div>
        );
    }

    /* ── Render: Form ────────────────────────────────────────── */
    return (
        <div className="checkout-page">
            <div className="checkout-bg-glow" aria-hidden />
            <div className="checkout-bg-blob checkout-bg-blob--1" aria-hidden />
            <div className="checkout-bg-blob checkout-bg-blob--2" aria-hidden />

            {/* NAV */}
            <header className="checkout-nav">
                <div className="checkout-nav-inner">
                    <Link to="/pricing" className="checkout-back">
                        <FiArrowLeft size={18} />
                        <span>{t.back}</span>
                    </Link>
                    <Link to="/" className="checkout-brand">
                        <img src="/logo.avif" alt="Fluency" className="checkout-brand-logo" />
                        <span className="checkout-brand-name">Fluency</span>
                    </Link>
                    <div className="checkout-secure-badge">
                        <LanguageSelector currentLanguage={language} onLanguageChange={setLanguage} />
                        <FiLock size={13} style={{ marginLeft: '1rem' }} />
                    </div>
                </div>
            </header>

            <main className="checkout-main">
                <div className="checkout-grid">

                    {/* ── COLUMNA IZQUIERDA: Formulario ── */}
                    <div className="checkout-form-col">

                        {/* Resumen móvil (acordeón) */}
                        <button
                            className="checkout-mobile-summary-toggle"
                            onClick={() => setShowOrderSummary((v) => !v)}
                            aria-expanded={showOrderSummary}
                        >
                            <span className="checkout-mobile-summary-label">
                                <FiZap size={14} />
                                {t.summaryTitle}
                            </span>
                            <span className="checkout-mobile-summary-right">
                                <strong>{plan.priceDisplay}</strong>
                                <FiChevronDown
                                    size={16}
                                    className={showOrderSummary ? 'rotated' : ''}
                                />
                            </span>
                        </button>

                        {showOrderSummary && (
                            <div className="checkout-mobile-summary-panel">
                                <OrderSummary billing={billing} setBilling={setBilling} plan={plan} t={t} />
                            </div>
                        )}

                        {/* ─ Billing toggle ─ */}
                        <div className="checkout-section">
                            <h2 className="checkout-section-title">1. {t.step2}</h2>
                            <div className="checkout-billing-toggle">
                                <label className={`checkout-billing-option ${billing === 'annual' ? 'is-active' : ''}`}>
                                    <input
                                        type="radio"
                                        name="billing"
                                        value="annual"
                                        checked={billing === 'annual'}
                                        onChange={() => setBilling('annual')}
                                    />
                                    <div className="checkout-billing-option-body">
                                        <div className="checkout-billing-option-header">
                                            <span className="checkout-billing-option-label">Anual</span>
                                            <span className="checkout-billing-savings">Ahorras 29%</span>
                                        </div>
                                        <div className="checkout-billing-option-price">
                                            <strong>$42.51 USD</strong>
                                            <span>/ year · $3.54 USD / month equivalent</span>
                                        </div>
                                    </div>
                                </label>

                                <label className={`checkout-billing-option ${billing === 'monthly' ? 'is-active' : ''}`}>
                                    <input
                                        type="radio"
                                        name="billing"
                                        value="monthly"
                                        checked={billing === 'monthly'}
                                        onChange={() => setBilling('monthly')}
                                    />
                                    <div className="checkout-billing-option-body">
                                        <div className="checkout-billing-option-header">
                                            <span className="checkout-billing-option-label">Mensual</span>
                                        </div>
                                        <div className="checkout-billing-option-price">
                                            <strong>$4.99 USD</strong>
                                            <span>/ month</span>
                                        </div>
                                    </div>
                                </label>
                            </div>
                        </div>

                        {/* ─ Formulario de pago ─ */}
                        <form className="checkout-form" onSubmit={handleSubmit} noValidate>

                            {/* Contacto */}
                            <div className="checkout-section">
                                <h2 className="checkout-section-title">2. {t.step1}</h2>
                                <div className="checkout-field-group">
                                    <div className={`checkout-field ${errors.email ? 'has-error' : ''}`}>
                                        <label htmlFor="checkout-email">Email</label>
                                        <input
                                            id="checkout-email"
                                            type="email"
                                            name="email"
                                            placeholder="tu@correo.com"
                                            value={form.email}
                                            onChange={handleChange}
                                            autoComplete="email"
                                        />
                                        {errors.email && <p className="checkout-field-error"><FiAlertCircle size={12} />{errors.email}</p>}
                                    </div>
                                    <div className={`checkout-field ${errors.name ? 'has-error' : ''}`}>
                                        <label htmlFor="checkout-name">{t.nameOnCard}</label>
                                        <input
                                            id="checkout-name"
                                            type="text"
                                            name="name"
                                            placeholder="Nombre Apellido"
                                            value={form.name}
                                            onChange={handleChange}
                                            autoComplete="cc-name"
                                        />
                                        {errors.name && <p className="checkout-field-error"><FiAlertCircle size={12} />{errors.name}</p>}
                                    </div>
                                </div>
                            </div>

                            {/* Pago */}
                            <div className="checkout-section">
                                <h2 className="checkout-section-title">3. {t.formTitle}</h2>
                                <p className="checkout-section-hint">{t.formSubtitle}</p>

                                <div className="checkout-field-group">
                                    <div className={`checkout-field ${errors.cardNumber ? 'has-error' : ''}`}>
                                        <label htmlFor="checkout-card-number">{t.cardNumber}</label>
                                        <div className="checkout-card-input-wrap">
                                            <input
                                                id="checkout-card-number"
                                                type="text"
                                                name="cardNumber"
                                                placeholder="0000 0000 0000 0000"
                                                value={form.cardNumber}
                                                onChange={handleChange}
                                                autoComplete="cc-number"
                                                inputMode="numeric"
                                            />
                                            <CardBrandBadge brand={cardBrand} />
                                        </div>
                                        {errors.cardNumber && <p className="checkout-field-error"><FiAlertCircle size={12} />{errors.cardNumber}</p>}
                                    </div>

                                    <div className="checkout-field-row">
                                        <div className={`checkout-field ${errors.expiry ? 'has-error' : ''}`}>
                                            <label htmlFor="checkout-expiry">{t.expiry}</label>
                                            <input
                                                id="checkout-expiry"
                                                type="text"
                                                name="expiry"
                                                placeholder="MM/AA"
                                                value={form.expiry}
                                                onChange={handleChange}
                                                autoComplete="cc-exp"
                                                inputMode="numeric"
                                            />
                                            {errors.expiry && <p className="checkout-field-error"><FiAlertCircle size={12} />{errors.expiry}</p>}
                                        </div>
                                        <div className={`checkout-field ${errors.cvv ? 'has-error' : ''}`}>
                                            <label htmlFor="checkout-cvv">
                                                {t.cvc}
                                            </label>
                                            <input
                                                id="checkout-cvv"
                                                type="text"
                                                name="cvv"
                                                placeholder="•••"
                                                value={form.cvv}
                                                onChange={handleChange}
                                                autoComplete="cc-csc"
                                                inputMode="numeric"
                                            />
                                            {errors.cvv && <p className="checkout-field-error"><FiAlertCircle size={12} />{errors.cvv}</p>}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Documento */}
                            <div className="checkout-section">
                                <h2 className="checkout-section-title">4. Documento</h2>
                                <div className="checkout-field-group">
                                    <div className="checkout-field-row">
                                        <div className="checkout-field checkout-field--select">
                                            <label htmlFor="checkout-doc-type">Tipo</label>
                                            <select
                                                id="checkout-doc-type"
                                                name="docType"
                                                value={form.docType}
                                                onChange={handleChange}
                                            >
                                                <option value="cc">Cédula (CC)</option>
                                                <option value="ce">Cédula Extranjería (CE)</option>
                                                <option value="nit">NIT</option>
                                                <option value="pasaporte">Pasaporte</option>
                                            </select>
                                        </div>
                                        <div className={`checkout-field ${errors.docNumber ? 'has-error' : ''}`}>
                                            <label htmlFor="checkout-doc-number">Documento</label>
                                            <input
                                                id="checkout-doc-number"
                                                type="text"
                                                name="docNumber"
                                                placeholder="1234567890"
                                                value={form.docNumber}
                                                onChange={handleChange}
                                                inputMode="numeric"
                                            />
                                            {errors.docNumber && <p className="checkout-field-error"><FiAlertCircle size={12} />{errors.docNumber}</p>}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Total + Submit */}
                            <div className="checkout-submit-section">
                                <div className="checkout-total-line">
                                    <span>{t.total}</span>
                                    <strong>{plan.billedAs}</strong>
                                </div>

                                <button type="submit" className="checkout-submit-btn">
                                    <FiLock size={16} />
                                    {t.payBtn} · {plan.billedAs}
                                </button>

                                <p className="checkout-legal">
                                    {t.secureNotice}
                                </p>

                                <div className="checkout-trust-badges">
                                    <span><FiShield size={13} /> Pago cifrado SSL</span>
                                    <span><FiLock size={13} /> Seguro</span>
                                </div>
                            </div>
                        </form>
                    </div>

                    {/* ── COLUMNA DERECHA: Resumen del pedido (desktop) ── */}
                    <aside className="checkout-summary-col">
                        <div className="checkout-summary-sticky">
                            <OrderSummary billing={billing} setBilling={setBilling} plan={plan} t={t} />
                        </div>
                    </aside>
                </div>
            </main>
        </div>
    );
}

/* ── Componente separado: Resumen del pedido ─────────────────── */
function OrderSummary({ billing, plan, t }) {
    return (
        <div className="checkout-summary">
            <div className="checkout-summary-header">
                <div className="checkout-summary-plan-badge">
                    <FiZap size={14} />
                    Fluency Premium
                </div>
                <div className="checkout-summary-price">
                    <span className="checkout-summary-price-amount">{plan.priceDisplay}</span>
                    <span className="checkout-summary-price-period">USD / {plan.period}</span>
                </div>
                {plan.savingsBadge && (
                    <div className="checkout-summary-savings">{plan.savingsBadge}</div>
                )}
                <p className="checkout-summary-billed-as">{plan.label}</p>
            </div>

            <div className="checkout-summary-divider" />

            <div className="checkout-summary-line-items">
                <div className="checkout-summary-line">
                    <span>Fluency Premium {billing === 'annual' ? 'Anual' : 'Mensual'}</span>
                    <span>{plan.billedAs}</span>
                </div>
                <div className="checkout-summary-line checkout-summary-line--total">
                    <span>{t.total}</span>
                    <strong>{plan.billedAs}</strong>
                </div>
            </div>

            <div className="checkout-summary-guarantee">
                <FiShield size={20} className="checkout-summary-guarantee-icon" />
                <div>
                    <p className="checkout-summary-guarantee-title">{t.guarantee}</p>
                </div>
            </div>
        </div>
    );
}
