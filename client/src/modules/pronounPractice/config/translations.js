export const pronounSidebarLabels = {
    es: {
        pronouns: 'Pronombres',
        table: 'Tabla',
        practice: 'Practica',
        pronounsReference: 'Referencia de pronombres',
        pronounPractice: 'Entrenamiento guiado',
    },
    en: {
        pronouns: 'Pronouns',
        table: 'Chart',
        practice: 'Practice',
        pronounsReference: 'Pronouns reference',
        pronounPractice: 'Guided practice',
    },
};

export function getPronounSidebarLabels(language = 'en') {
    return pronounSidebarLabels[language] || pronounSidebarLabels.en;
}
