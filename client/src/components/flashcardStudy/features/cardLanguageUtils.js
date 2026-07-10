/** studyLanguage: idioma que el usuario quiere aprender ('en' | 'es'). */
export function isLearningEnglish(studyLanguage) {
    return studyLanguage === 'en';
}

export function getCardTitle(displayData, _studyLanguage) {
    return displayData.name || '';
}

export function getStudyExampleText(definition, _studyLanguage) {
    if (!definition) return '';
    return definition.usage_example || '';
}

export function getReferenceExampleText(definition, _studyLanguage) {
    if (!definition) return '';
    return definition.usage_example_es || '';
}

/** TTS del texto visible en la tarjeta (mismo idioma que se estudia). */
export function getAudioLang(studyLanguage) {
    return isLearningEnglish(studyLanguage) ? 'en' : 'es';
}

/** Conjugaciones e IPA de verbos en inglés. */
export function getAudioLangForConjugation() {
    return 'en';
}
