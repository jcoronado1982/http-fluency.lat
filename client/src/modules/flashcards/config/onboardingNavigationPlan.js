import {
    isCardFlipped,
    isCatalogOpen,
    isCategorySelected,
    isFlashcardsModuleReady,
    isSidebarOpen,
    isStudyViewActive,
} from './onboardingUiAutomation';

const buildSteps = (locale) => {
    const es = locale === 'es';
    return [
        {
            id: 'menu-hamburguesa',
            selector: '[data-tour="menu-hamburguesa"]',
            performAction: 'openSidebar',
            label: es ? 'Abre el menú' : 'Open the menu',
            hint: es
                ? 'Toca el botón ☰ arriba a la izquierda o pulsa Siguiente para abrir el menú lateral.'
                : 'Tap the ☰ button in the top-left or press Next to open the side menu.',
            fallback: es
                ? 'Primero abre el menú lateral. Ahí aparecen los módulos que puedes usar.'
                : 'First open the side menu. That is where your available modules appear.',
            prep: { sidebar: false, floatingMenu: false, catalog: false },
            gate: isSidebarOpen,
        },
        {
            id: 'cargar-modulo-flashcards',
            selector: '[data-tour="flashcards-nav"]',
            markOptionsSelector: '[data-tour="flashcards-nav"]',
            performAction: 'navigateFlashcards',
            tooltipPlacement: 'right',
            tooltipGap: 14,
            label: es ? 'Carga el módulo Flashcards' : 'Load the Flashcards module',
            hint: es
                ? 'Toca esta opción del menú lateral o pulsa Siguiente para entrar al módulo de Flashcards.'
                : 'Tap this side-menu option or press Next to enter the Flashcards module.',
            fallback: es
                ? 'Esta es la opción que carga Flashcards. Cuando quieras estudiar palabras, entra por aquí.'
                : 'This is the option that loads Flashcards. Whenever you want to study words, enter here.',
            prep: { sidebar: true, floatingMenu: false, catalog: false },
            gate: isFlashcardsModuleReady,
            gateTimeoutMs: 15000,
        },
        {
            id: 'catalogo-categorias',
            selector: '[data-tour="catalogo-categorias"]',
            performAction: 'openCatalog',
            tooltipPlacement: 'left',
            tooltipGap: 14,
            gateTimeoutMs: 10000,
            label: es ? 'Catálogo de categorías' : 'Category catalog',
            hint: es
                ? 'Ahora toca «Categorías» para abrir el catálogo de palabras.'
                : 'Now tap «Categories» to open the word catalog.',
            fallback: es
                ? 'Aquí empieza la configuración de lo que vas a practicar: primero abres Categorías.'
                : 'This is where you start choosing what to practice: first open Categories.',
            prep: { sidebar: false, floatingMenu: true, catalog: false },
            gate: isCatalogOpen,
        },
        {
            id: 'elegir-categoria',
            highlightMode: 'zone',
            selector: '[data-tour="panel-categorias"]',
            zoneSelector: '[data-tour="panel-categorias"]',
            sectionSelector: '[data-tour="panel-categorias"]',
            tapSelector: '[data-tour="categoria-item"]',
            markOptionsSelector: '[data-tour="categoria-item"]',
            label: es ? 'Elige una categoría' : 'Pick a category',
            hint: es
                ? 'Toca cualquier categoría de la columna izquierda: Pronombres, Verbos, Sustantivos, etc.'
                : 'Tap any category in the left column: Pronouns, Verbs, Nouns, etc.',
            fallback: es
                ? 'Todas las categorías están marcadas. Elige la que quieras estudiar: verbos, sustantivos, pronombres, conectores…'
                : 'All categories are marked. Pick what you want to study: verbs, nouns, pronouns, connectors…',
            prep: { sidebar: false, floatingMenu: false, catalog: true },
            gate: isCategorySelected,
        },
        {
            id: 'elegir-subtema',
            highlightMode: 'zone',
            selector: '[data-tour="catalogo-grid"]',
            zoneSelector: '[data-tour="catalogo-modal"]',
            sectionSelector: '[data-tour="catalogo-grid"]',
            tapSelector: '[data-tour="boton-abrir-categoria"]',
            markOptionsSelector: '[data-tour="boton-abrir-categoria"]',
            label: es ? 'Elige un subtema / bloque' : 'Pick a subtopic block',
            hint: es
                ? 'Toca cualquier bloque disponible (Sujeto, Reflexivos, etc.) para empezar la lección.'
                : 'Tap any available block (Subject, Reflexives, etc.) to start the lesson.',
            fallback: es
                ? 'Cada tarjeta es un bloque de palabras. Puedes elegir cualquiera de las opciones marcadas en amarillo.'
                : 'Each card is a word block. You can pick any of the yellow-marked options.',
            prep: { sidebar: false, floatingMenu: false, catalog: true },
            gate: isStudyViewActive,
        },
        {
            id: 'boton-voltear-tarjeta',
            selector: '[data-tour="boton-voltear-tarjeta"]',
            performAction: 'flipCard',
            acceptKeyboard: true,
            keyboardKeys: ['ArrowUp', 'ArrowDown'],
            tooltipPlacement: 'top',
            label: es ? 'Voltear tarjeta' : 'Flip card',
            hint: es
                ? 'Toca la tarjeta central o usa las teclas ↑ ↓ del teclado para voltearla y ver la traducción.'
                : 'Tap the center card or press ↑ ↓ on your keyboard to flip it and see the translation.',
            fallback: es
                ? 'Esta es tu tarjeta de estudio: palabra, fonética y ejemplos.'
                : 'This is your study card: word, phonetics, and examples.',
            prep: { sidebar: false, floatingMenu: false, catalog: false },
            gate: isCardFlipped,
            gateTimeoutMs: 8000,
        },
        {
            id: 'boton-anterior-tarjeta',
            selector: '[data-tour="boton-anterior-tarjeta"]',
            performAction: 'prevCard',
            acceptKeyboard: true,
            keyboardKeys: ['ArrowLeft'],
            tooltipPlacement: 'top',
            label: es ? 'Tarjeta anterior ←' : 'Previous card ←',
            hint: es
                ? 'Toca la flecha izquierda o pulsa ← en el teclado para volver a la tarjeta anterior.'
                : 'Tap the left arrow or press ← on your keyboard to go to the previous card.',
            fallback: es
                ? 'Así retrocedes palabra por palabra dentro del bloque.'
                : 'This is how you move back word by word in the block.',
            prep: { sidebar: false, floatingMenu: false, catalog: false },
            gate: () => true,
        },
        {
            id: 'indicador-tarjetas',
            selector: '[data-tour="boton-contador-tarjetas"]',
            advanceWithoutAction: true,
            tooltipPlacement: 'top',
            label: es ? 'Indicador de progreso' : 'Progress indicator',
            hint: es
                ? 'Este contador muestra en qué tarjeta vas dentro del bloque actual (por ejemplo, 1 / 20).'
                : 'This counter shows which card you are on in the current block (for example, 1 / 20).',
            fallback: es
                ? 'Úsalo para orientarte mientras practicas el bloque.'
                : 'Use it to track your position while practicing the block.',
            prep: { sidebar: false, floatingMenu: false, catalog: false },
            gate: () => true,
        },
        {
            id: 'boton-marcar-aprendida',
            selector: '[data-tour="boton-marcar-aprendida"]',
            performAction: 'markLearned',
            tooltipPlacement: 'top',
            label: es ? 'Marcar aprendida ✓' : 'Mark learned ✓',
            hint: es
                ? 'Cuando domines la palabra, toca el botón verde ✓.'
                : 'When you know the word, tap the green ✓ button.',
            fallback: es
                ? 'El botón verde registra que ya aprendiste esta palabra.'
                : 'The green button records that you learned this word.',
            prep: { sidebar: false, floatingMenu: false, catalog: false },
            gate: () => true,
        },
        {
            id: 'boton-siguiente-tarjeta',
            selector: '[data-tour="boton-siguiente-tarjeta"]',
            performAction: 'nextCard',
            acceptKeyboard: true,
            keyboardKeys: ['ArrowRight'],
            tooltipPlacement: 'top',
            label: es ? 'Siguiente tarjeta →' : 'Next card →',
            hint: es
                ? 'Toca la flecha derecha o pulsa → en el teclado para pasar a la siguiente palabra.'
                : 'Tap the right arrow or press → on your keyboard for the next word.',
            fallback: es
                ? 'Así avanzas palabra por palabra en el bloque.'
                : 'This is how you move word by word through the block.',
            prep: { sidebar: false, floatingMenu: false, catalog: false },
            gate: () => true,
        },
        {
            id: 'boton-reiniciar-bloque',
            selector: '[data-tour="boton-reiniciar-bloque"]',
            advanceWithoutAction: true,
            tooltipPlacement: 'top',
            label: es ? 'Reiniciar bloque' : 'Reset block',
            hint: es
                ? 'Este botón reinicia el bloque actual de la categoría donde estás: vuelves al inicio del mazo sin cambiar de categoría.'
                : 'This button resets the current block in your category: you return to the start of the deck without leaving the category.',
            fallback: es
                ? 'Úsalo cuando quieras repasar el mismo bloque desde cero.'
                : 'Use it when you want to review the same block from the beginning.',
            prep: { sidebar: false, floatingMenu: false, catalog: false },
            gate: () => true,
        },
    ];
};

export const ONBOARDING_NAV_PLAN = {
    es: {
        coach: 'Guía interactiva · Fluency',
        routeLabel: 'Paso',
        back: 'Atrás',
        finish: 'Comenzar a aprender',
        close: 'Cerrar',
        hint: 'Siguiente',
        next: 'Siguiente',
        waiting: 'Esperando a que aparezca este componente en pantalla…',
        elementMissing: 'Este elemento aún no está en pantalla. Pulsa Siguiente cuando esté listo o toca la opción marcada.',
        wrongTap: 'Toca la opción resaltada para continuar con el recorrido.',
        tapRequired: 'Toca la opción resaltada para avanzar. El botón Siguiente no aplica en este paso.',
        stateTimeout: 'La pantalla no cambió como esperábamos. Intenta tocar de nuevo la opción marcada.',
        finalTitle: '¡Recorrido completado!',
        finalBody: 'Ya abriste el menú, entraste al módulo Flashcards, abriste el catálogo, elegiste categoría y subtema, y probaste voltear, navegar con flechas, el indicador, marcar aprendida y reiniciar bloque. ¡A practicar!',
        steps: buildSteps('es'),
    },
    en: {
        coach: 'Interactive Guide · Fluency',
        routeLabel: 'Step',
        back: 'Back',
        finish: 'Start learning',
        close: 'Close',
        hint: 'Next',
        next: 'Next',
        waiting: 'Waiting for this component to appear on screen…',
        elementMissing: 'This element is not on screen yet. Press Next when ready or tap the marked option.',
        wrongTap: 'Tap the highlighted option to continue the tour.',
        tapRequired: 'Tap the highlighted option to continue. The Next button does not apply on this step.',
        stateTimeout: 'The screen did not change as expected. Try tapping a marked option again.',
        finalTitle: 'Tour complete!',
        finalBody: 'You opened the menu, entered the Flashcards module, opened the catalog, picked category and subtopic, and tried flip, arrow navigation, the counter, mark learned, and reset block. Time to practice!',
        steps: buildSteps('en'),
    },
};

export function applyStepPrep(step, { setIsSidebarOpen, setIsFloatingMenuOpen, setIsCatalogVisible }) {
    if (!step?.prep) return;
    setIsSidebarOpen(Boolean(step.prep.sidebar));
    setIsFloatingMenuOpen(Boolean(step.prep.floatingMenu));
    setIsCatalogVisible(Boolean(step.prep.catalog));
}
