import React, { useState, useRef, useEffect } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { FiBookOpen, FiImage, FiTrendingUp, FiVolume2, FiZap, FiCheck, FiSliders } from 'react-icons/fi';
import { useAuth } from '../../context/AuthContext';
import { useAppContext } from '../../context/AppContext';
import config from '../../config';
import { getAuthenticatedHomePath } from '../index';
import { getLandingTranslations } from './config/translations';
import PageLoader from '../../components/common/PageLoader';
import ShellFooter from '../../components/shell/ShellFooter';
import DemoFlashcardSession from './features/DemoFlashcardSession';
import './LandingPage.css';

function LangToggle({ language, setLanguage }) {
    return (
        <div className="lp-lang" role="group" aria-label="Language">
            <button
                type="button"
                className={language === 'es' ? 'is-active' : ''}
                onClick={() => setLanguage('es')}
            >ES</button>
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

function LazyDemoFlashcardSession({ language, promptExtraRef, applySignal, t, onApplyPrompt }) {
    const hostRef = useRef(null);
    const [mounted, setMounted] = useState(() => (
        typeof window !== 'undefined' && window.location.hash === '#demo'
    ));

    useEffect(() => {
        if (mounted) return undefined;
        const node = hostRef.current;
        if (!node) return undefined;

        if (typeof IntersectionObserver === 'undefined') {
            setMounted(true);
            return undefined;
        }

        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting) {
                    setMounted(true);
                    observer.disconnect();
                }
            },
            { rootMargin: '160px' },
        );
        observer.observe(node);
        return () => observer.disconnect();
    }, [mounted]);

    return (
        <div ref={hostRef} className="lp-demo-widget">
            <DemoImagePromptPanel
                promptRef={promptExtraRef}
                onApply={onApplyPrompt}
                t={t}
                collapsible
            />
            {mounted ? (
                <DemoFlashcardSession
                    language={language}
                    promptExtraRef={promptExtraRef}
                    imagePromptApplySignal={applySignal}
                />
            ) : (
                <div className="lp-demo-widget-placeholder" aria-hidden />
            )}
        </div>
    );
}

export default function LandingPage() {
    const { isAuthenticated, loading, loadingStage } = useAuth();
    const { language = 'en', setLanguage } = useAppContext();
    const t = getLandingTranslations(language);
    const demoPromptExtraRef = useRef('');
    const [demoImagePromptApply, setDemoImagePromptApply] = useState(0);

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

    if (isAuthenticated) {
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

                    <nav className="lp-nav-links">
                        <a href="#demo">{t.navFlashcards}</a>
                        <a href="#why">{t.navProgress}</a>
                        <Link to="/pricing">{t.navPricing}</Link>
                    </nav>

                    <div className="lp-nav-end">
                        <LangToggle language={language} setLanguage={setLanguage} />
                        <Link to="/login" className="lp-nav-login">{t.navLogin}</Link>
                        <Link to="/login" className="lp-btn lp-btn--sm">{t.navSignup}</Link>
                    </div>
                </div>
            </header>

            <main>
                {/* ── HERO ── */}
                <section className="lp-hero">
                    <div className="lp-hero-inner">
                        <div className="lp-hero-copy">
                            <p className="lp-hero-eyebrow">{t.heroEyebrow}</p>
                            <h1 className="lp-hero-title">{t.heroTitle}</h1>
                            <p className="lp-hero-mission">{t.heroMission}</p>
                            <p className="lp-hero-sub">{t.heroSubtitle}</p>
                            <div className="lp-hero-cta">
                                <Link to="/login" className="lp-btn">{t.ctaSignup}</Link>
                                <a
                                    href="#demo"
                                    className="lp-btn lp-btn--ghost"
                                >{t.ctaTryDemo}</a>
                            </div>
                        </div>

                        <div className="lp-hero-card-preview" aria-hidden>
                            <div className="lp-preview-card lp-preview-card--back" />
                            <div className="lp-preview-card lp-preview-card--mid" />
                            <div className="lp-preview-card lp-preview-card--front">
                                <span className="lp-preview-cat">{t.previewCat}</span>
                                <strong className="lp-preview-word">be</strong>
                                <span className="lp-preview-phonetic">/biː/</span>
                                <span className="lp-preview-hint">{t.previewHint}</span>
                            </div>
                        </div>
                    </div>
                </section>

                {/* ── DEMO ── */}
                <section className="lp-demo" id="demo">
                    <div className="lp-section-inner">
                        <div className="lp-demo-copy">
                            <span className="lp-eyebrow">{t.demoEyebrow}</span>
                            <h2>{t.demoTitle}</h2>
                            <p>{t.demoBody}</p>
                            <ul className="lp-demo-bullets">
                                <li><FiCheck aria-hidden /> {t.demoBullet1}</li>
                                <li><FiCheck aria-hidden /> {t.demoBullet2}</li>
                                <li><FiCheck aria-hidden /> {t.demoBullet3}</li>
                            </ul>
                            <Link to="/login" className="lp-demo-link">
                                {t.demoCtaFull}
                            </Link>
                        </div>
                        <LazyDemoFlashcardSession
                            language={language}
                            promptExtraRef={demoPromptExtraRef}
                            applySignal={demoImagePromptApply}
                            t={t}
                            onApplyPrompt={() => setDemoImagePromptApply((n) => n + 1)}
                        />
                    </div>
                </section>

                {/* ── WHY ── */}
                <section className="lp-why" id="why">
                    <div className="lp-section-inner lp-why-inner">
                        <h2 className="lp-why-title">{t.highlightsTitle}</h2>
                        <div className="lp-why-grid">
                            <article className="lp-why-card">
                                <FiBookOpen aria-hidden />
                                <h3>{t.highlightWords}</h3>
                                <p>{t.highlightWordsDesc}</p>
                            </article>
                            <article className="lp-why-card">
                                <FiZap aria-hidden />
                                <h3>{t.highlightStreak}</h3>
                                <p>{t.highlightStreakDesc}</p>
                            </article>
                            <article className="lp-why-card">
                                <FiTrendingUp aria-hidden />
                                <h3>{t.highlightCefr}</h3>
                                <p>{t.highlightCefrDesc}</p>
                            </article>
                            <article className="lp-why-card">
                                <FiImage aria-hidden />
                                <h3>{t.highlightAi}</h3>
                                <p>{t.highlightAiDesc}</p>
                            </article>
                            <article className="lp-why-card">
                                <FiVolume2 aria-hidden />
                                <h3>{t.highlightAudio}</h3>
                                <p>{t.highlightAudioDesc}</p>
                            </article>
                        </div>
                    </div>
                </section>

                {/* ── CTA BOTTOM ── */}
                <section className="lp-cta-bottom">
                    <div className="lp-section-inner lp-cta-bottom-inner">
                        <h2>{t.ctaBottomTitle}</h2>
                        <p>{t.ctaBottomSub}</p>
                        <Link to="/login" className="lp-btn">{t.ctaSignup}</Link>
                    </div>
                </section>
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
