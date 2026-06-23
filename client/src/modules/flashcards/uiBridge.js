/**
 * Puente de UI del módulo flashcards.
 * Permite al shell (FloatingMenu) invocar acciones del módulo sin importar su contexto React.
 */
const bridge = {
    openCatalog: null,
    openIpa: null,
    openPhonics: null,
};

export function registerFlashcardUiBridge(handlers) {
    Object.assign(bridge, handlers);
}

export function getFlashcardUiBridge() {
    return bridge;
}
