import React, { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import DemoFlashcardSession from './DemoFlashcardSession';
import DemoImagePromptPanel from './DemoImagePromptPanel';

/**
 * LandingHero — sección hero: titular, CTA de registro y el widget demo
 * interactivo (tarjeta + panel de prompt de imagen).
 * SRP: es dueña del estado del prompt del demo; la página no lo conoce.
 */
export default function LandingHero({ t, language }) {
    const demoPromptExtraRef = useRef('');
    const [demoImagePromptApply, setDemoImagePromptApply] = useState(0);

    return (
        <section className="lp-hero">
            <div className="lp-section-inner lp-hero-inner">
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
    );
}
