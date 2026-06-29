/** Muestra solo la palabra principal en español (sin paréntesis ni sinónimos con "/"). */
export function simplifySpanishMeaning(meaning) {
    if (!meaning) return '';
    return meaning
        .replace(/\s*\([^)]*\)\s*/g, ' ')
        .split('/')[0]
        .trim();
}

/** studyLanguage: idioma que el usuario quiere aprender ('en' | 'es'). */
export function isLearningEnglish(studyLanguage) {
    return studyLanguage === 'en';
}

export function getCardTitle(displayData, studyLanguage) {
    if (isLearningEnglish(studyLanguage)) {
        return displayData.name;
    }
    return simplifySpanishMeaning(displayData.definitions?.[0]?.meaning || displayData.name);
}

/** TTS del texto visible en la tarjeta (mismo idioma que se estudia). */
export function getAudioLang(studyLanguage) {
    return isLearningEnglish(studyLanguage) ? 'en' : 'es';
}

/** Conjugaciones e IPA de verbos en inglés. */
export function getAudioLangForConjugation() {
    return 'en';
}
