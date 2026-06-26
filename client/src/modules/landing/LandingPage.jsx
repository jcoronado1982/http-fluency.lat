import React, { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { FiBookOpen, FiImage, FiTrendingUp, FiZap, FiSliders, FiLayers, FiTarget } from 'react-icons/fi';
import { useAuth } from '../../context/AuthContext';
import { useAppContext } from '../../context/AppContext';
import config from '../../config';
import { getAuthenticatedHomePath } from '../index';
import { getLandingTranslations } from './config/translations';
import PageLoader from '../../components/common/PageLoader';
import ShellFooter from '../../components/shell/ShellFooter';
import DemoFlashcardSession from './features/DemoFlashcardSession';
import DemoFeedback from './features/DemoFeedback';
import { hasDemoFeedbackReturn } from './demoFeedbackStorage';
import {
    isLandingSectionHash,
    scrollToLandingSection,
} from './landingSections';
import './LandingPage.css';

function useLandingNavActive() {
    const [active, setActive] = useState('demo');

    useEffect(() => {
        const demo = document.getElementById('demo');
        const vocabularyFirst = document.getElementById('vocabulary-first');
        const reviews = document.getElementById('reviews');
        const targets = [demo, vocabularyFirst, reviews].filter(Boolean);
        if (!targets.length) return undefined;

        const observer = new IntersectionObserver(
            (entries) => {
                const visible = entries
                    .filter((entry) => entry.isIntersecting)
                    .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
                const id = visible[0]?.target?.id;
                if (id) setActive(id);
            },
            { rootMargin: '-35% 0px -45% 0px', threshold: [0, 0.15, 0.4, 0.7] },
        );

        targets.forEach((el) => observer.observe(el));
        return () => observer.disconnect();
    }, []);

    const setActiveSection = useCallback((id) => setActive(id), []);

    return { active, setActiveSection };
}

function LangToggle({ language, setLanguage }) {
    return (
        <div className="lp-lang" role="group" aria-label="Language">
            <button
                type="button"
                className={language === 'es' ? 'is-active' : ''}
                onClick={() => setLanguage('es')}
            >ES</button>
            <span className="lp-lang-sep" aria-hidden="true">/</span>
            <button
                type="button"
                className={language === 'en' ? 'is-active' : ''}
                onClick={() => setLanguage('en')}
            >EN</button>
        </div>
    );
}

function DemoImagePromptPanel({ promptRef, onApply, t, collapsible = false }) {
    const [value, setValue] = useState('');
    const [open, setOpen] = useState(false);

    const syncRef = (next) => {
        promptRef.current = next;
    };

    const handleApply = () => {
        syncRef(value);
        onApply();
    };

    const form = (
        <>
            <div className="lp-demo-prompt-row">
                <input
                    id="demo-image-prompt"
                    type="text"
                    className="lp-demo-prompt-input"
                    value={value}
                    onChange={(e) => {
                        setValue(e.target.value);
                        syncRef(e.target.value);
                    }}
                    placeholder={t.demoImagePromptPlaceholder}
                    autoComplete="off"
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                            e.preventDefault();
                            handleApply();
                        }
                    }}
                />
                <button
                    type="button"
                    className="lp-demo-prompt-apply"
                    onClick={handleApply}
                >
                    {t.demoImagePromptApply}
                </button>
            </div>
            <p className="lp-demo-prompt-hint">{t.demoImagePromptHint}</p>
        </>
    );

    if (collapsible) {
        return (
            <div className={`lp-demo-prompt lp-demo-prompt--card ${open ? 'is-open' : ''}`}>
                <button
                    type="button"
                    className="lp-demo-prompt-toggle"
                    onClick={() => setOpen((o) => !o)}
                    aria-expanded={open}
                    aria-controls="demo-image-prompt-panel"
                >
                    <FiSliders aria-hidden />
                    <span>{t.demoImagePromptLabel}</span>
                </button>
                {open && (
                    <div id="demo-image-prompt-panel" className="lp-demo-prompt-body">
                        {form}
                    </div>
                )}
            </div>
        );
    }

    return (
        <div className="lp-demo-prompt">
            <label className="lp-demo-prompt-label" htmlFor="demo-image-prompt">
                {t.demoImagePromptLabel}
            </label>
            {form}
        </div>
    );
}

const VOCAB_FIRST_CARD_ICONS = [FiLayers, FiBookOpen, FiTarget];
const VOCAB_FIRST_CARD_ICON_TONES = ['rose', 'violet', 'rose'];

export default function LandingPage() {
    const { isAuthenticated, loading, loadingStage } = useAuth();
    const { language = 'en', setLanguage } = useAppContext();
    const location = useLocation();
    const t = getLandingTranslations(language);
    const pricingEnabled = config.features.pricing !== false;
    const { active: activeNav, setActiveSection } = useLandingNavActive();
    const demoPromptExtraRef = useRef('');
    const [demoImagePromptApply, setDemoImagePromptApply] = useState(0);
    const returningForFeedback = hasDemoFeedbackReturn();

    useEffect(() => {
        if (!returningForFeedback) return;
        if (window.location.hash !== '#demo') {
            window.location.hash = 'demo';
        }
        const el = document.getElementById('demo');
        el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, [returningForFeedback]);

    useLayoutEffect(() => {
        if (loading || returningForFeedback) return undefined;
        const hash = location.hash?.replace('#', '');
        if (!isLandingSectionHash(hash)) return undefined;
        setActiveSection(hash);
        return scrollToLandingSection(hash);
    }, [loading, location.hash, location.pathname, returningForFeedback, setActiveSection]);

    if (loading) {
        const copy = t.loading[loadingStage] ?? t.loading.fallback;
        return (
            <PageLoader
                className="landing-page-loader"
                title={copy.title}
                subtitle={copy.subtitle}
                status={copy.status}
                progress={copy.progress}
            />
        );
    }

    const landingSectionHash = isLandingSectionHash(location.hash);

    if (isAuthenticated && !returningForFeedback && !landingSectionHash) {
        return <Navigate to={getAuthenticatedHomePath(config, [])} replace />;
    }

    return (
        <div className="lp">
            <header className="lp-nav">
                <div className="lp-nav-inner">
                    <Link to="/" className="lp-brand">
                        <img src="/logo.avif" alt="" className="lp-brand-logo" />
                        <span className="lp-brand-name">{t.brand}</span>
                    </Link>

                    <nav className="lp-nav-links" aria-label="Primary">
                        <a
                            href="#demo"
                            className={activeNav === 'demo' ? 'is-active' : ''}
                            onClick={() => setActiveSection('demo')}
                        >
                            {t.navHowItWorks}
                        </a>
                        {pricingEnabled && (
                            <Link
                                to="/pricing"
                                className={location.pathname === '/pricing' ? 'is-active' : ''}
                            >
                                {t.navPricing}
                            </Link>
                        )}
                        <a
                            href="#vocabulary-first"
                            className={activeNav === 'vocabulary-first' ? 'is-active' : ''}
                            onClick={() => setActiveSection('vocabulary-first')}
                        >
                            {t.navWhyVocabularyFirst}
                        </a>
                        <a
                            href="#reviews"
                            className={activeNav === 'reviews' ? 'is-active' : ''}
                            onClick={() => setActiveSection('reviews')}
                        >
                            {t.navFeedback}
                        </a>
                    </nav>

                    <div className="lp-nav-end">
                        <LangToggle language={language} setLanguage={setLanguage} />
                        {isAuthenticated ? (
                            <Link
                                to={getAuthenticatedHomePath(config, [])}
                                className="lp-btn lp-btn--nav"
                            >
                                {t.navApp}
                            </Link>
                        ) : (
                            <>
                                <Link to="/login" className="lp-nav-login">
                                    {t.navLogin}
                                </Link>
                                <Link to="/login" className="lp-btn lp-btn--nav">
                                    {t.navSignupShort}
                                </Link>
                            </>
                        )}
                    </div>
                </div>
            </header>

            <main>
                <div className="lp-zone-flow">
                {/* ── HERO ── */}
                <section className="lp-hero">
                    <div className="lp-hero-inner">
                        <div className="lp-hero-copy">
                            <p className="lp-hero-eyebrow">{t.heroEyebrow}</p>
                            <h1 className="lp-hero-title">
                                <span className="lp-hero-title-line1">{t.heroTitleLine1}</span>
                                <span className="lp-hero-title-line2">
                                    {t.heroTitleFrom}{' '}{t.heroTitleAccent}
                                </span>
                            </h1>
                            <p className="lp-hero-sub">{t.heroSubtitle}</p>
                            <div className="lp-hero-cta">
                                <Link to="/login" className="lp-btn">{t.ctaSignup}</Link>
                            </div>
                            <div className="lp-hero-trust" aria-hidden>
                                <span>{t.trustFree}</span>
                                <span className="lp-hero-trust-dot" />
                                <span>{t.trustNoCard}</span>
                                <span className="lp-hero-trust-dot" />
                                <span>{t.trustWords}</span>
                            </div>
                        </div>

                        <div className="lp-hero-demo lp-demo-widget" id="demo">
                            <DemoImagePromptPanel
                                promptRef={demoPromptExtraRef}
                                onApply={() => setDemoImagePromptApply((n) => n + 1)}
                                t={t}
                                collapsible
                            />
                            <DemoFlashcardSession
                                language={language}
                                badgeLabel={t.demoInteractiveBadge}
                                promptExtraRef={demoPromptExtraRef}
                                imagePromptApplySignal={demoImagePromptApply}
                            />
                        </div>
                    </div>
                </section>
                </div>

                {/* ── FEEDBACK + VOCABULARY FIRST + WHY + CTA: un solo degradado ── */}
                <div className="lp-zone-lower">
                    <section className="lp-feedback-section" id="reviews">
                        <div className="lp-section-inner">
                            <DemoFeedback language={language} />
                        </div>
                    </section>
                    <section className="lp-why-vocabulary-first" id="vocabulary-first">
                        <div className="lp-section-inner lp-why-vocabulary-first-inner">
                            <h2 className="lp-why-vocabulary-first-title">{t.vocabularyFirstTitle}</h2>
                            <div className="lp-vocab-first-grid">
                                {t.vocabularyFirstCards.map((card, index) => {
                                    const Icon = VOCAB_FIRST_CARD_ICONS[index];
                                    const tone = VOCAB_FIRST_CARD_ICON_TONES[index];
                                    return (
                                        <article key={card.title} className="lp-vocab-first-card">
                                            <div className={`lp-vocab-first-card-icon lp-vocab-first-card-icon--${tone}`}>
                                                <Icon aria-hidden />
                                            </div>
                                            <h3 className="lp-vocab-first-card-title">{card.title}</h3>
                                            <p className="lp-vocab-first-card-body">{card.body}</p>
                                        </article>
                                    );
                                })}
                            </div>
                        </div>
                    </section>
                    <section className="lp-why" id="why">
                    <div className="lp-section-inner lp-why-inner">
                        <span className="lp-why-eyebrow">{t.whyEyebrow}</span>
                        <h2 className="lp-why-title">{t.whyTitle}</h2>
                        <p className="lp-why-subtitle">{t.whySubtitle}</p>
                        <div className="lp-why-grid">
                            <article className="lp-why-card">
                                <div className="lp-why-card-icon lp-why-card-icon--rose">
                                    <FiBookOpen aria-hidden />
                                </div>
                                <div className="lp-why-card-body">
                                    <h3>{t.highlightWords}</h3>
                                    <p>{t.highlightWordsDesc}</p>
                                </div>
                            </article>
                            <article className="lp-why-card">
                                <div className="lp-why-card-icon lp-why-card-icon--violet">
                                    <FiZap aria-hidden />
                                </div>
                                <div className="lp-why-card-body">
                                    <h3>{t.highlightStreak}</h3>
                                    <p>{t.highlightStreakDesc}</p>
                                </div>
                            </article>
                            <article className="lp-why-card">
                                <div className="lp-why-card-icon lp-why-card-icon--rose">
                                    <FiTrendingUp aria-hidden />
                                </div>
                                <div className="lp-why-card-body">
                                    <h3>{t.highlightCefr}</h3>
                                    <p>{t.highlightCefrDesc}</p>
                                </div>
                            </article>
                            <article className="lp-why-card">
                                <div className="lp-why-card-icon lp-why-card-icon--rose">
                                    <FiImage aria-hidden />
                                </div>
                                <div className="lp-why-card-body">
                                    <h3>{t.highlightAi}</h3>
                                    <p>{t.highlightAiDesc}</p>
                                </div>
                            </article>
                        </div>

                        <div className="lp-why-cta-tail">
                            <span className="lp-why-cta-eyebrow">{t.ctaBottomEyebrow}</span>
                            <h2 className="lp-why-cta-title">{t.ctaBottomTitle}</h2>
                            <p className="lp-why-cta-sub">{t.ctaBottomSub}</p>
                            <Link to="/login" className="lp-btn lp-btn--cta">{t.ctaSignup}</Link>
                            <div className="lp-why-cta-trust">
                                <span>{t.trustFree}</span>
                                <span className="lp-why-cta-trust-sep" aria-hidden>·</span>
                                <span>{t.trustNoCard}</span>
                                <span className="lp-why-cta-trust-sep" aria-hidden>·</span>
                                <span>{t.trustCancel}</span>
                            </div>
                        </div>
                    </div>
                </section>
                </div>
            </main>

            <ShellFooter
                variant="landing"
                labels={{
                    documentation: t.footerDocumentation,
                    portfolio: t.footerPortfolio,
                    github: t.footerGithub,
                }}
            />

            {/* decorative bg */}
            <div className="lp-bg-glow" aria-hidden />
            <div className="lp-bg-blob lp-bg-blob--1" aria-hidden />
            <div className="lp-bg-blob lp-bg-blob--2" aria-hidden />
        </div>
    );
}
