import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useUIContext } from '../../context/UIContext';
import { useFlashcardUiContext } from './context/FlashcardUiContext';
import {
    applyStepPrep,
    ONBOARDING_NAV_PLAN,
} from './config/onboardingNavigationPlan';
import {
    isCatalogOpen,
    isFlashcardsModuleReady,
    queryTourTarget,
    waitForCondition,
} from './config/onboardingUiAutomation';
import { computeTooltipLayout } from './config/computeTooltipLayout';
import styles from './FlashcardOnboardingTour.module.css';

const TOOLTIP_WIDTH = 340;
const TOOLTIP_ESTIMATED_HEIGHT = 220;
const HIGHLIGHT_PADDING = 8;
const SIDEBAR_TRANSITION_MS = 420;
const WRONG_TAP_COOLDOWN_MS = 2200;
const GATE_TIMEOUT_MS = 5000;
const NAV_TAP_ADVANCE_DELAY_MS = 180;

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

export default function FlashcardOnboardingTour() {
    const { language = 'en', setIsSidebarOpen, setIsFloatingMenuOpen } = useUIContext();
    const { completeOnboarding } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const { setIsCatalogVisible } = useFlashcardUiContext();
    const isOnboardingTour = new URLSearchParams(location.search).get('onboarding_tour') === 'flashcards';
    const locale = language === 'es' ? 'es' : 'en';
    const copy = ONBOARDING_NAV_PLAN[locale];

    const [stepIndex, setStepIndex] = useState(0);
    const [stepFeedback, setStepFeedback] = useState('enter');
    const [targetRect, setTargetRect] = useState(null);
    const [targetMissing, setTargetMissing] = useState(false);
    const [isAdvancing, setIsAdvancing] = useState(false);
    const [positionVersion, setPositionVersion] = useState(0);
    const tooltipRef = useRef(null);
    const wrongTapCooldownRef = useRef(0);

    useEffect(() => {
        setStepFeedback('enter');
    }, [stepIndex]);

    const [viewport, setViewport] = useState({
        width: typeof window === 'undefined' ? 1280 : window.innerWidth,
        height: typeof window === 'undefined' ? 720 : window.innerHeight,
    });

    const isFinalStep = isOnboardingTour && stepIndex >= copy.steps.length;
    const activeStep = isOnboardingTour && !isFinalStep ? copy.steps[stepIndex] : null;
    const isZoneStep = activeStep?.highlightMode === 'zone';
    const stepCounterText = `${stepIndex + 1} / ${copy.steps.length}`;
    const bodyText = useMemo(() => {
        if (isFinalStep) return copy.finalBody;
        if (targetMissing) return copy.elementMissing;
        if (stepFeedback === 'wrong_tap') return copy.wrongTap;
        if (stepFeedback === 'gate_timeout') return copy.stateTimeout;
        if (stepFeedback === 'tap_required') return copy.tapRequired;
        return activeStep?.hint || activeStep?.fallback || '';
    }, [activeStep, copy, isFinalStep, stepFeedback, targetMissing]);

    useEffect(() => {
        if (typeof window === 'undefined') return undefined;
        const frameId = window.requestAnimationFrame(() => {
            setPositionVersion((current) => current + 1);
        });
        return () => window.cancelAnimationFrame(frameId);
    }, [bodyText, targetMissing]);

    useEffect(() => {
        const el = tooltipRef.current;
        if (!el || typeof ResizeObserver === 'undefined') return undefined;
        const observer = new ResizeObserver(() => {
            setPositionVersion((v) => v + 1);
        });
        observer.observe(el);
        return () => observer.disconnect();
    }, []);

    useEffect(() => {
        if (!isOnboardingTour) return undefined;
        if (!activeStep) {
            setIsCatalogVisible(false);
            setIsSidebarOpen(false);
            setIsFloatingMenuOpen(false);
            return;
        }

        applyStepPrep(activeStep, {
            setIsSidebarOpen,
            setIsFloatingMenuOpen,
            setIsCatalogVisible,
        });
    }, [activeStep, isOnboardingTour, setIsCatalogVisible, setIsFloatingMenuOpen, setIsSidebarOpen]);

    useEffect(() => {
        if (typeof document === 'undefined') return undefined;

        document.querySelectorAll('[data-tour-marked]').forEach((node) => {
            node.removeAttribute('data-tour-marked');
        });
        document.querySelectorAll('[data-tour-zone-active]').forEach((node) => {
            node.removeAttribute('data-tour-zone-active');
        });
        document.querySelectorAll('[data-tour-section-active]').forEach((node) => {
            node.removeAttribute('data-tour-section-active');
        });

        if (activeStep?.sectionSelector) {
            const section = document.querySelector(activeStep.sectionSelector);
            section?.setAttribute('data-tour-section-active', 'true');
        }

        if (!activeStep?.markOptionsSelector) return undefined;

        document.querySelectorAll(activeStep.markOptionsSelector).forEach((node) => {
            node.setAttribute('data-tour-marked', 'true');
        });

        return () => {
            document.querySelectorAll('[data-tour-marked]').forEach((node) => {
                node.removeAttribute('data-tour-marked');
            });
            document.querySelectorAll('[data-tour-section-active]').forEach((node) => {
                node.removeAttribute('data-tour-section-active');
            });
        };
    }, [activeStep, stepIndex]);

    useEffect(() => {
        if (typeof window === 'undefined') return undefined;

        const updateViewport = () => {
            setViewport({
                width: window.innerWidth,
                height: window.innerHeight,
            });
        };

        updateViewport();
        window.addEventListener('resize', updateViewport);
        return () => window.removeEventListener('resize', updateViewport);
    }, []);

    useEffect(() => {
        if (typeof window === 'undefined') return undefined;

        let frameId = 0;
        let attempts = 0;
        let activeTarget = null;
        let transitionTimer = 0;

        const syncRect = () => {
            if (!activeStep) {
                setTargetRect(null);
                setTargetMissing(false);
                return;
            }

            const highlightSelector = activeStep.zoneSelector || activeStep.selector;
            const target = queryTourTarget(highlightSelector);
            if (target) {
                if (activeTarget !== target) {
                    activeTarget?.removeAttribute('data-tour-active');
                    activeTarget?.removeAttribute('data-tour-zone-active');
                    activeTarget = target;
                    if (isZoneStep) {
                        activeTarget.setAttribute('data-tour-zone-active', 'true');
                    } else {
                        activeTarget.setAttribute('data-tour-active', 'true');
                    }
                    if (!isZoneStep) {
                        target.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'auto' });
                    }
                }

                const rect = target.getBoundingClientRect();
                const isVisible = rect.width > 0
                    && rect.height > 0
                    && rect.bottom > 0
                    && rect.right > 0
                    && rect.top < viewport.height
                    && rect.left < viewport.width;

                if (isVisible) {
                    setTargetRect(rect);
                    setTargetMissing(false);
                    return;
                }
            }

            if (attempts < 80) {
                attempts += 1;
                frameId = window.requestAnimationFrame(syncRect);
                return;
            }

            setTargetRect(null);
            setTargetMissing(true);
        };

        const delay = (
            activeStep?.id === 'menu-hamburguesa'
            || activeStep?.id === 'cargar-modulo-flashcards'
            || activeStep?.id === 'catalogo-categorias'
        ) ? SIDEBAR_TRANSITION_MS : 100;
        transitionTimer = window.setTimeout(syncRect, delay);
        window.addEventListener('scroll', syncRect, true);
        window.addEventListener('resize', syncRect);

        return () => {
            activeTarget?.removeAttribute('data-tour-active');
            activeTarget?.removeAttribute('data-tour-zone-active');
            window.cancelAnimationFrame(frameId);
            window.clearTimeout(transitionTimer);
            window.removeEventListener('scroll', syncRect, true);
            window.removeEventListener('resize', syncRect);
        };
    }, [activeStep, isZoneStep, stepIndex, viewport.height, viewport.width]);

    const performTargetClick = useCallback(() => {
        if (!activeStep) return false;

        if (activeStep.performAction === 'openCatalog') {
            setIsCatalogVisible(true);
            return true;
        }

        if (activeStep.performAction === 'openSidebar') {
            setIsSidebarOpen(true);
            return true;
        }

        const tapSelector = activeStep.tapSelector || activeStep.selector;
        const target = queryTourTarget(tapSelector);
        if (target instanceof HTMLElement) {
            target.click();
            return true;
        }

        if (isZoneStep && activeStep.markOptionsSelector) {
            const firstOption = document.querySelector(activeStep.markOptionsSelector);
            if (firstOption instanceof HTMLElement) {
                firstOption.click();
                return true;
            }
        }

        return false;
    }, [activeStep, isZoneStep, setIsCatalogVisible, setIsSidebarOpen]);

    const advanceStep = useCallback(async ({ skipClick = false } = {}) => {
        if (!activeStep || isAdvancing) return;

        setIsAdvancing(true);
        if (!skipClick) {
            performTargetClick();
            if (activeStep.performAction === 'openCatalog') {
                await new Promise((resolve) => {
                    window.requestAnimationFrame(() => {
                        window.requestAnimationFrame(resolve);
                    });
                });
            }
        }

        const gateFn = typeof activeStep.gate === 'function' ? activeStep.gate : () => true;
        const gateTimeout = activeStep.gateTimeoutMs ?? GATE_TIMEOUT_MS;
        const passed = await waitForCondition(gateFn, { timeout: gateTimeout });

        if (passed) {
            setStepIndex((current) => current + 1);
            setTargetMissing(false);
        } else {
            setStepFeedback('gate_timeout');
        }
        setIsAdvancing(false);
    }, [activeStep, isAdvancing, performTargetClick]);

    useEffect(() => {
        if (activeStep?.id !== 'cargar-modulo-flashcards' || isAdvancing) return undefined;
        if (stepFeedback !== 'gate_timeout') return undefined;
        if (!isFlashcardsModuleReady()) return undefined;

        const timer = window.setTimeout(() => {
            advanceStep({ skipClick: true });
        }, 120);

        return () => window.clearTimeout(timer);
    }, [activeStep, advanceStep, isAdvancing, location.pathname, stepFeedback]);

    useEffect(() => {
        if (activeStep?.id !== 'catalogo-categorias' || isAdvancing) return undefined;
        if (stepFeedback !== 'gate_timeout') return undefined;
        if (!isCatalogOpen()) return undefined;

        const timer = window.setTimeout(() => {
            advanceStep({ skipClick: true });
        }, 120);

        return () => window.clearTimeout(timer);
    }, [activeStep, advanceStep, isAdvancing, stepFeedback]);

    const handleNext = useCallback(() => {
        if (activeStep?.advanceOnTapOnly) {
            setStepFeedback('tap_required');
            return;
        }
        advanceStep({ skipClick: false });
    }, [activeStep, advanceStep]);

    useEffect(() => {
        if (typeof window === 'undefined' || !activeStep || targetMissing) return undefined;

        const handleTap = (event) => {
            if (tooltipRef.current?.contains(event.target) || isAdvancing) return;

            const tapSelector = activeStep.tapSelector || activeStep.selector;
            const highlightSelector = activeStep.zoneSelector || activeStep.selector;
            const expected = queryTourTarget(highlightSelector);

            if (!expected && !queryTourTarget(tapSelector)) {
                setTargetMissing(true);
                return;
            }

            const tappedOption = event.target.closest(tapSelector);
            if (tappedOption) {
                if (activeStep.performAction === 'openCatalog') {
                    setIsCatalogVisible(true);
                }
                const tapDelay = activeStep.id === 'cargar-modulo-flashcards'
                    ? NAV_TAP_ADVANCE_DELAY_MS
                    : 80;
                window.setTimeout(() => {
                    advanceStep({ skipClick: true });
                }, tapDelay);
                return;
            }

            if (isZoneStep && event.target.closest(highlightSelector)) {
                return;
            }

            const now = Date.now();
            if (now - wrongTapCooldownRef.current < WRONG_TAP_COOLDOWN_MS) return;
            wrongTapCooldownRef.current = now;
            setStepFeedback('wrong_tap');
        };

        document.addEventListener('click', handleTap, true);
        return () => document.removeEventListener('click', handleTap, true);
    }, [activeStep, advanceStep, isAdvancing, isZoneStep, setIsCatalogVisible, targetMissing]);

    const anchorRect = useMemo(() => {
        if (!targetRect) return null;
        if (typeof document === 'undefined') return targetRect;

        if (isZoneStep && activeStep?.sectionSelector) {
            const section = queryTourTarget(activeStep.sectionSelector);
            if (section) return section.getBoundingClientRect();
        }

        const tapSelector = activeStep?.tapSelector || activeStep?.selector;
        if (!isZoneStep && tapSelector) {
            const tapTarget = queryTourTarget(tapSelector);
            if (tapTarget) return tapTarget.getBoundingClientRect();
        }

        return targetRect;
    }, [activeStep, isZoneStep, positionVersion, targetRect]);

    const focusBox = useMemo(() => {
        if (!targetRect || isFinalStep) return null;

        const top = clamp(targetRect.top - HIGHLIGHT_PADDING, 0, viewport.height);
        const left = clamp(targetRect.left - HIGHLIGHT_PADDING, 0, viewport.width);
        const right = clamp(targetRect.right + HIGHLIGHT_PADDING, 0, viewport.width);
        const bottom = clamp(targetRect.bottom + HIGHLIGHT_PADDING, 0, viewport.height);

        return {
            top,
            left,
            right,
            bottom,
            width: Math.max(0, right - left),
            height: Math.max(0, bottom - top),
        };
    }, [isFinalStep, targetRect, viewport.height, viewport.width]);

    const tooltipLayout = useMemo(() => {
        const tooltipWidth = tooltipRef.current?.offsetWidth || TOOLTIP_WIDTH;
        const tooltipHeight = tooltipRef.current?.offsetHeight || TOOLTIP_ESTIMATED_HEIGHT;
        const layoutAnchor = anchorRect;

        if (!layoutAnchor) {
            return {
                style: {
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    '--arrow-x': '50%',
                },
                placement: null,
                arrowOffset: 0,
            };
        }

        const layout = computeTooltipLayout({
            anchorRect: layoutAnchor,
            viewport,
            tooltipWidth,
            tooltipHeight,
            gap: activeStep?.tooltipGap,
            preferredPlacements: activeStep?.tooltipPlacement
                ? [activeStep.tooltipPlacement]
                : undefined,
        });

        if (!layout) {
            const left = clamp(
                layoutAnchor.left + layoutAnchor.width / 2 - tooltipWidth / 2,
                16,
                viewport.width - tooltipWidth - 16,
            );
            return {
                style: {
                    top: clamp(layoutAnchor.bottom + 14, 16, viewport.height - tooltipHeight - 16),
                    left,
                    '--arrow-x': `${layoutAnchor.left + layoutAnchor.width / 2 - left}px`,
                },
                placement: 'bottom',
                arrowOffset: layoutAnchor.left + layoutAnchor.width / 2 - left,
            };
        }

        return {
            style: {
                top: layout.top,
                left: layout.left,
                '--arrow-x': `${layout.arrowOffset}px`,
            },
            placement: layout.placement,
            arrowOffset: layout.arrowOffset,
        };
    }, [
        activeStep?.tooltipGap,
        activeStep?.tooltipPlacement,
        anchorRect,
        positionVersion,
        viewport.height,
        viewport.width,
    ]);

    const handleFinish = async () => {
        await completeOnboarding();
        navigate(location.pathname, { replace: true });
    };

    const handleBack = () => {
        if (stepIndex === 0) return;
        setStepIndex((current) => current - 1);
    };

    const handleClose = () => {
        navigate('/onboarding', { replace: true });
    };

    if (!isOnboardingTour) return null;

    const tourUi = (
        <div className={styles.overlay}>
            {focusBox ? (
                <>
                    <div className={`${styles.scrimBlock} ${isZoneStep ? styles.scrimBlockZone : ''}`} style={{ top: 0, left: 0, width: '100%', height: focusBox.top }} />
                    <div className={`${styles.scrimBlock} ${isZoneStep ? styles.scrimBlockZone : ''}`} style={{ top: focusBox.bottom, left: 0, width: '100%', height: viewport.height - focusBox.bottom }} />
                    <div className={`${styles.scrimBlock} ${isZoneStep ? styles.scrimBlockZone : ''}`} style={{ top: focusBox.top, left: 0, width: focusBox.left, height: focusBox.height }} />
                    <div className={`${styles.scrimBlock} ${isZoneStep ? styles.scrimBlockZone : ''}`} style={{ top: focusBox.top, left: focusBox.right, width: viewport.width - focusBox.right, height: focusBox.height }} />
                </>
            ) : (
                <div className={styles.scrim} />
            )}
            {focusBox && (
                <div
                    className={`${styles.highlight} ${isZoneStep ? styles.highlightZone : ''}`}
                    style={{
                        top: focusBox.top,
                        left: focusBox.left,
                        width: focusBox.width,
                        height: focusBox.height,
                    }}
                />
            )}

            <section
                ref={tooltipRef}
                className={styles.tooltip}
                data-placement={tooltipLayout.placement || undefined}
                style={tooltipLayout.style}
            >
                <header className={styles.tooltipHeader}>
                    <span className={styles.stepBadge}>{stepCounterText}</span>
                    <button type="button" className={styles.closeButton} onClick={handleClose} aria-label={copy.close}>
                        <span aria-hidden="true">×</span>
                    </button>
                </header>
                <p className={styles.eyebrow}>{copy.coach}</p>
                {isFinalStep ? (
                    <h2 className={styles.title}>{copy.finalTitle}</h2>
                ) : (
                    activeStep?.label && <h2 className={styles.title}>{activeStep.label}</h2>
                )}
                <p className={styles.body}>{bodyText}</p>

                <div className={styles.actions}>
                    <button type="button" className={styles.secondaryButton} onClick={handleBack} disabled={stepIndex === 0}>
                        {copy.back}
                    </button>
                    {!isFinalStep ? (
                        <button
                            type="button"
                            className={styles.primaryButton}
                            onClick={handleNext}
                            disabled={isAdvancing || activeStep?.advanceOnTapOnly}
                            title={activeStep?.advanceOnTapOnly ? copy.tapRequired : undefined}
                        >
                            {copy.next}
                        </button>
                    ) : (
                        <button type="button" className={styles.primaryButton} onClick={handleFinish}>
                            {copy.finish}
                        </button>
                    )}
                </div>
            </section>
        </div>
    );

    if (typeof document === 'undefined') return tourUi;

    return createPortal(tourUi, document.body);
}
