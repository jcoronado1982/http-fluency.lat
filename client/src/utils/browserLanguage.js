export const INTERFACE_LANGUAGE_KEY = 'interface_language';
export const STUDY_LANGUAGE_KEY = 'study_language';

export function normalizeAppLanguage(value) {
    return value === 'es' ? 'es' : 'en';
}

export function detectBrowserLanguage() {
    if (typeof navigator === 'undefined') return 'en';

    const preferred = navigator.language || navigator.languages?.[0] || 'en';
    return preferred.toLowerCase().startsWith('es') ? 'es' : 'en';
}

function readStoredLanguage(key) {
    if (typeof window === 'undefined') return null;
    const saved = window.localStorage.getItem(key);
    return saved === 'es' || saved === 'en' ? saved : null;
}

export function getInitialInterfaceLanguage() {
    return readStoredLanguage(INTERFACE_LANGUAGE_KEY) ?? detectBrowserLanguage();
}

export function getInitialStudyLanguage() {
    return readStoredLanguage(STUDY_LANGUAGE_KEY) ?? 'en';
}

export function persistInterfaceLanguage(language) {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(INTERFACE_LANGUAGE_KEY, normalizeAppLanguage(language));
}

export function persistStudyLanguage(language) {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(STUDY_LANGUAGE_KEY, normalizeAppLanguage(language));
}
