/** Muestra solo la palabra principal en español (sin paréntesis ni sinónimos con "/"). */
export function simplifySpanishMeaning(meaning) {
    if (!meaning) return '';
    return meaning
        .replace(/\s*\([^)]*\)\s*/g, ' ')
        .split('/')[0]
        .trim();
}

export function getCardTitle(displayData, currentLanguage) {
    if (currentLanguage === 'es') {
        return displayData.name;
    }
    return simplifySpanishMeaning(displayData.definitions?.[0]?.meaning || displayData.name);
}

/** Idioma TTS del texto visible (UI es → inglés; UI en → español). */
export function getAudioLang(uiLanguage) {
    return uiLanguage === 'es' ? 'en' : 'es';
}

/** Conjugaciones e IPA de verbos en inglés. */
export function getAudioLangForConjugation() {
    return 'en';
}
