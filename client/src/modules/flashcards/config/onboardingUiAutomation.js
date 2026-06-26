/** Slugs semánticos para data-categoria (automatización / IA). */
export const CATEGORY_TOUR_SLUGS = {
    nouns: 'sustantivos',
    verbs: 'verbos',
    adjectives: 'adjetivos',
    adverbs: 'adverbios',
    preposition: 'preposiciones',
    pronouns: 'pronombres',
    connectors: 'conectores',
    determinant: 'determinantes',
    phrasal_verbs: 'phrasal_verbs',
};

export const DEFAULT_TOUR_CATEGORY = 'pronombres';

export function categoryToTourSlug(categoryId) {
    return CATEGORY_TOUR_SLUGS[categoryId] || categoryId;
}

export function isSidebarOpen() {
    return Boolean(document.querySelector('.app-sidebar.open'));
}

export function isFloatingMenuOpen() {
    return Boolean(document.querySelector('.floatingOptions.show'));
}

export function isCatalogOpen() {
    return Boolean(document.querySelector('[data-tour="catalogo-modal"]'));
}

export function isCategorySelected() {
    return Boolean(document.querySelector('[data-tour="categoria-item"][aria-current="true"]'));
}

/** @deprecated use isCategorySelected */
export function isCategoryActive() {
    return isCategorySelected();
}

export function isStudyViewActive() {
    return Boolean(
        document.querySelector('[data-tour="flashcard-contenedor"]')
        && !isCatalogOpen(),
    );
}

export function isFlashcardsModuleRoute() {
    if (typeof window === 'undefined') return false;
    const { pathname } = window.location;
    return pathname === '/' || pathname === '/flashcard' || pathname.startsWith('/flashcard/');
}

/** Vista de estudio lista: módulo cargado (aunque aún no haya tarjeta activa). */
export function isFlashcardsModuleReady() {
    return isFlashcardsModuleRoute() && Boolean(
        document.querySelector('[data-tour="flashcard-contenedor"]')
        || document.querySelector('.flashcard-page-wrapper')
        || document.querySelector('.flashcard-main-area'),
    );
}

export function isCardFlipped() {
    const card = document.querySelector('[data-tour="boton-voltear-tarjeta"]');
    return card?.getAttribute('data-flipped') === 'true';
}

export function queryTourTarget(selector) {
    return document.querySelector(selector);
}

export function readUiSnapshot() {
    const visibleTargets = Array.from(document.querySelectorAll('[data-tour]'))
        .map((node) => {
            const rect = node.getBoundingClientRect();
            const isVisible = rect.width > 0
                && rect.height > 0
                && rect.bottom > 0
                && rect.right > 0
                && rect.top < window.innerHeight
                && rect.left < window.innerWidth;

            if (!isVisible) return null;

            const text = (node.getAttribute('aria-label') || node.textContent || '')
                .replace(/\s+/g, ' ')
                .trim()
                .slice(0, 80);

            return {
                tour: node.getAttribute('data-tour'),
                categoria: node.getAttribute('data-categoria') || null,
                aria_current: node.getAttribute('aria-current') || null,
                aria_expanded: node.getAttribute('aria-expanded') || null,
                text,
            };
        })
        .filter(Boolean)
        .slice(0, 40);

    return {
        sidebar_open: isSidebarOpen(),
        floating_menu_open: isFloatingMenuOpen(),
        catalog_open: isCatalogOpen(),
        study_view: isStudyViewActive(),
        card_flipped: isCardFlipped(),
        visible_targets: visibleTargets,
        path: typeof window !== 'undefined' ? window.location.pathname : '',
    };
}

export function waitForCondition(checkFn, { timeout = 5000, interval = 120 } = {}) {
    return new Promise((resolve) => {
        const started = Date.now();

        const tick = () => {
            if (checkFn()) {
                resolve(true);
                return;
            }
            if (Date.now() - started >= timeout) {
                resolve(false);
                return;
            }
            window.setTimeout(tick, interval);
        };

        tick();
    });
}

export function getTapAutomationLabel(element) {
    if (!(element instanceof Element)) return 'desconocido';
    const tourNode = element.closest('[data-tour]');
    if (tourNode) {
        const tour = tourNode.getAttribute('data-tour');
        const categoria = tourNode.getAttribute('data-categoria');
        return categoria ? `${tour}[${categoria}]` : tour;
    }
    const aria = element.getAttribute('aria-label');
    if (aria) return aria;
    return element.tagName.toLowerCase();
}
