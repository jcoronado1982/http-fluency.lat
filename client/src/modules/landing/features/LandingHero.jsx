import React, { useRef, useState } from 'react';
import DemoFlashcardSession from './DemoFlashcardSession';
import DemoImagePromptPanel from './DemoImagePromptPanel';
import DemoImageCarousel from './DemoImageCarousel';

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
                    <h1 className="lp-hero-title">
                        <span className="lp-hero-title-line1">{t.heroTitleLine1}</span>
                        <span className="lp-hero-title-line2">
                            {t.heroTitleFrom}{' '}{t.heroTitleAccent}
                        </span>
                    </h1>
                    <p className="lp-hero-sub">
                        <span>{t.heroSubtitleLine1}</span>
                        <span className="lp-hero-sub-closing">{t.heroSubtitleLine2}</span>
                    </p>
                    <div className="lp-hero-cta">
                        <a href="#demo" className="lp-btn lp-hero-demo-link">{t.ctaTryDemo}</a>
                        <span className="lp-hero-cta-note">{t.heroCtaNote}</span>
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

            <DemoImageCarousel t={t} />
        </section>
    );
}
