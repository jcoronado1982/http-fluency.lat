import React, { useState, useCallback, useRef } from 'react';
import { FiChevronLeft, FiChevronRight, FiRotateCcw } from 'react-icons/fi';
import CardFront from '../../flashcards/features/CardFront';
import CardBack from '../../flashcards/features/CardBack';
import styles from '../../flashcards/features/Flashcard.module.css';
import demoCards from '../data/demoCards.json';
import demoStyles from './DemoFlashcard.module.css';

const TOTAL = demoCards.length;

// No-op stubs: demo no hace llamadas API de audio ni imagen
const noop = () => {};
const noopAsync = async () => {};

export default function DemoFlashcard({ language = 'en' }) {
    const [index, setIndex] = useState(0);
    const [isFlipped, setIsFlipped] = useState(false);
    const [known, setKnown] = useState(new Set());
    const imageRef = useRef(null);

    const card = demoCards[index];
    const isKnown = known.has(card.id);

    const go = (dir) => {
        setIsFlipped(false);
        setTimeout(() => {
            setIndex((i) => (i + dir + TOTAL) % TOTAL);
        }, 180);
    };

    const markKnown = (e) => {
        e.stopPropagation();
        setKnown((prev) => {
            const next = new Set(prev);
            if (next.has(card.id)) next.delete(card.id);
            else next.add(card.id);
            return next;
        });
    };

    const reset = (e) => {
        e.stopPropagation();
        setKnown(new Set());
        setIndex(0);
        setIsFlipped(false);
    };

    // blurredState: empezar sin blur para que el demo sea inmediato
    const blurredState = {};
    const toggleBlur = useCallback((di) => {
        // no-op en demo — ejemplos siempre visibles
    }, []);

    const learnedCount = known.size;
    const progress = (learnedCount / TOTAL) * 100;
    const es = language === 'es';

    return (
        <div className={demoStyles.demo}>
            {/* Header */}
            <div className={demoStyles.header}>
                <span className={demoStyles.headerLabel}>
                    {es ? 'Verbos esenciales' : 'Essential verbs'} · {index + 1}/{TOTAL}
                </span>
                <div className={demoStyles.headerRight}>
                    <span className={demoStyles.learnedPill}>
                        {learnedCount} {es ? 'aprendidas' : 'learned'}
                    </span>
                    {learnedCount > 0 && (
                        <button
                            type="button"
                            className={demoStyles.resetBtn}
                            onClick={reset}
                            title={es ? 'Reiniciar' : 'Reset'}
                        >
                            <FiRotateCcw size={14} />
                        </button>
                    )}
                </div>
            </div>

            {/* Progress bar */}
            <div className={demoStyles.progressBar} aria-hidden>
                <div className={demoStyles.progressFill} style={{ width: `${progress}%` }} />
            </div>

            {/* Real flashcard with CardFront / CardBack */}
            <div
                className={`${styles.flashcardContainer} ${demoStyles.cardContainer}`}
                onClick={() => setIsFlipped((f) => !f)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === 'Enter' && setIsFlipped((f) => !f)}
                aria-label={es ? 'Voltear tarjeta' : 'Flip card'}
            >
                <div className={`${styles.card} ${isFlipped ? styles.flipped : ''}`}>
                    <CardFront
                        cardData={card}
                        activeForm="v1"
                        setActiveForm={noop}
                        onOpenIpaModal={noop}
                        playAudio={noop}
                        playDefinitionMedia={noopAsync}
                        activeAudioText={null}
                        highlightedWordIndex={-1}
                        blurredState={blurredState}
                        toggleBlur={toggleBlur}
                        isImageLoading={false}
                        isGeneratingImage={false}
                        imageUrl={null}
                        imageRef={imageRef}
                        deleteImage={noop}
                        uploadImage={noopAsync}
                        handleImageError={noop}
                        canCustomizeImages={false}
                        deleteAudio={noop}
                        isGeneratingAudio={false}
                        currentLanguage={language}
                    />
                    <CardBack
                        cardData={card}
                        activeForm="v1"
                        currentLanguage={language}
                    />
                </div>
            </div>

            {/* Controls */}
            <div className={demoStyles.controls}>
                <button
                    type="button"
                    className={demoStyles.navBtn}
                    onClick={(e) => { e.stopPropagation(); go(-1); }}
                    aria-label={es ? 'Anterior' : 'Previous'}
                >
                    <FiChevronLeft size={22} />
                </button>

                <button
                    type="button"
                    className={`${demoStyles.learnBtn} ${isKnown ? demoStyles.learnBtnActive : ''}`}
                    onClick={markKnown}
                >
                    {isKnown
                        ? (es ? '✓ Aprendida' : '✓ Learned')
                        : (es ? 'Marcar aprendida' : 'Mark as learned')}
                </button>

                <button
                    type="button"
                    className={demoStyles.navBtn}
                    onClick={(e) => { e.stopPropagation(); go(1); }}
                    aria-label={es ? 'Siguiente' : 'Next'}
                >
                    <FiChevronRight size={22} />
                </button>
            </div>

            <p className={demoStyles.demoNote}>
                {es
                    ? '✦ Demo gratis · 10 verbos esenciales · Sin registro'
                    : '✦ Free demo · 10 essential verbs · No sign-up needed'}
            </p>
        </div>
    );
}
