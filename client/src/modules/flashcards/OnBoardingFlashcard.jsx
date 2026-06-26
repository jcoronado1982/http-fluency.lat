import React, { useMemo, useState } from 'react';
import { useUIContext } from '../../context/UIContext';
import styles from './OnBoardingFlashcard.module.css';

const COPY = {
    es: {
        interfaceOptions: [
            { id: 'es', title: 'Ver la app en Español' },
            { id: 'en', title: 'Ver la app en Inglés' },
        ],
        studyOptions: [
            { id: 'en', title: 'Quiero aprender Inglés', flag: '🇪🇸 → 🇬🇧 / 🇺🇸' },
            { id: 'es', title: 'Quiero aprender Español', flag: '🇬🇧 / 🇺🇸 → 🇪🇸' },
        ],
        stepLabel: 'Flujo de Onboarding: Paso',
        next: 'Siguiente',
        selectLanguage: 'Selecciona un idioma',
        continueSpanish: 'Continuar con Español',
        continueEnglish: 'Continuar con Inglés',
        continueTourEntry: 'Iniciar recorrido guiado',
        tourHint: 'Automatización local: detecta tus taps en data-tour, resalta cada control y avanza cuando la pantalla cambia.',
        startLearning: 'Comenzar a aprender',
        back: 'Atrás',
        welcomeTitle: '¡Te damos la bienvenida a Fluency!',
        welcomeSubtitle: '¿En qué idioma prefieres ver los menús y las instrucciones de la aplicación?',
        studyTitle: 'Tu idioma de estudio',
        studySubtitle: '¿Qué idiomas quieres estudiar?',
        englishLabel: 'Inglés',
        spanishLabel: 'Español',
    },
    en: {
        interfaceOptions: [
            { id: 'es', title: 'View the app in Spanish' },
            { id: 'en', title: 'View the app in English' },
        ],
        studyOptions: [
            { id: 'en', title: 'I want to learn English', flag: '🇪🇸 → 🇬🇧 / 🇺🇸' },
            { id: 'es', title: 'I want to learn Spanish', flag: '🇬🇧 / 🇺🇸 → 🇪🇸' },
        ],
        stepLabel: 'Onboarding Flow: Step',
        next: 'Next',
        selectLanguage: 'Select a language',
        continueSpanish: 'Continue with Spanish',
        continueEnglish: 'Continue with English',
        continueTourEntry: 'Start guided tour',
        tourHint: 'Local automation: detects your data-tour taps, highlights each control, and advances when the screen changes.',
        startLearning: 'Start learning',
        back: 'Back',
        welcomeTitle: 'Welcome to Fluency!',
        welcomeSubtitle: 'Which language would you like to use for the app menus and instructions?',
        studyTitle: 'Your study language',
        studySubtitle: 'What languages do you want to study?',
        englishLabel: 'English',
        spanishLabel: 'Spanish',
    },
};

const STEP_TOTAL = 4;

const OnBoardingFlashcard = ({
    module,
    user,
    onStart,
    onStartTour,
}) => {
    const { language, setLanguage, studyLanguage, setStudyLanguage } = useUIContext();
    const browserLocale = useMemo(() => {
        if (typeof navigator === 'undefined') return 'en';
        return navigator.language?.toLowerCase().startsWith('es') ? 'es' : 'en';
    }, []);
    const locale = language === 'es' ? 'es' : 'en';
    const t = COPY[locale];
    const [currentStep, setCurrentStep] = useState(1);
    const [selectedStudyLanguage, setSelectedStudyLanguage] = useState(studyLanguage === 'es' ? 'es' : 'en');
    const [selectedInterfaceLanguage, setSelectedInterfaceLanguage] = useState(
        language === 'es' ? 'es' : browserLocale,
    );

    const primaryButtonLabel = useMemo(() => {
        if (currentStep === 1) {
            return t.next;
        }
        if (currentStep === 2) {
            return t.continueTourEntry;
        }
        if (currentStep === 3) {
            return t.selectLanguage;
        }
        return t.startLearning;
    }, [currentStep, t]);

    const canContinue = currentStep !== 2 || Boolean(selectedStudyLanguage);

    const handleContinue = async () => {
        if (currentStep === 2 && !selectedStudyLanguage) return;
        if (currentStep === 1) {
            setCurrentStep(2);
            return;
        }
        if (currentStep === 2) {
            onStartTour(module.to);
            return;
        }
        await onStart(module.to);
    };

    const handleBack = () => {
        if (currentStep === 1) return;
        setCurrentStep((step) => step - 1);
    };

    const renderStepContent = () => {
        if (currentStep === 1) {
            return (
                <>
                    <h1 className={styles.title}>{t.welcomeTitle}</h1>
                    <p className={styles.subtitle}>
                        {user?.name || user?.email || 'Usuario'}, {t.welcomeSubtitle}
                    </p>

                    <section className={styles.pillList}>
                        {t.interfaceOptions.map((option) => {
                            const isSelected = selectedInterfaceLanguage === option.id;

                            return (
                                <button
                                    key={option.id}
                                    type="button"
                                    onClick={() => {
                                        setSelectedInterfaceLanguage(option.id);
                                        setLanguage(option.id);
                                    }}
                                    className={`${styles.pillButton} ${isSelected ? styles.pillButtonSelected : ''}`}
                                >
                                    {option.title}
                                </button>
                            );
                        })}
                    </section>
                </>
            );
        }

        if (currentStep === 2) {
            return (
                <>
                    <h1 className={styles.title}>{t.studyTitle}</h1>
                    <p className={styles.subtitle}>
                        {t.studySubtitle}
                    </p>
                    <p className={styles.tourHint}>{t.tourHint}</p>

                    <section className={styles.grid}>
                        {t.studyOptions.map((option) => {
                            const isSelected = selectedStudyLanguage === option.id;

                            return (
                                <button
                                    key={option.id}
                                    type="button"
                                    onClick={() => {
                                        setSelectedStudyLanguage(option.id);
                                        setStudyLanguage(option.id);
                                    }}
                                    className={`${styles.optionCard} ${isSelected ? styles.optionCardSelected : ''}`}
                                >
                                    <span className={styles.optionFlag}>{option.flag}</span>
                                    <h2 className={styles.optionTitle}>{option.title}</h2>
                                </button>
                            );
                        })}
                    </section>
                </>
            );
        }

        return null;
    };

    return (
        <main className={styles.page}>
            <section className={styles.hero}>
                <p className={styles.eyebrow}>
                    {t.stepLabel} {currentStep} / {STEP_TOTAL}
                </p>
                {renderStepContent()}

                <div className={styles.actions}>
                    {currentStep > 1 && (
                        <button type="button" onClick={handleBack} className={`${styles.button} ${styles.buttonSecondary}`}>
                            {t.back}
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={handleContinue}
                        disabled={!canContinue}
                        className={`${styles.button} ${styles.buttonPrimary}`}
                    >
                        {primaryButtonLabel}
                    </button>
                </div>
            </section>
        </main>
    );
};

export default OnBoardingFlashcard;
