export function detectBrowserLanguage() {
    if (typeof navigator === 'undefined') return 'en';

    const preferred = navigator.language || navigator.languages?.[0] || 'en';
    return preferred.toLowerCase().startsWith('es') ? 'es' : 'en';
}
