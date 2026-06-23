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
        return simplifySpanishMeaning(displayData.definitions?.[0]?.meaning || displayData.name);
    }
    return displayData.name;
}
