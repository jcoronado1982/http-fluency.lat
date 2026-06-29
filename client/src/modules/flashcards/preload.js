import { flashcardPort } from './composition';
import { FALLBACK_CATEGORIES, sortCategories } from './config/catalogOrder';
import { LAST_CATEGORY_KEY, LAST_DECK_KEY_PREFIX } from './config/sessionKeys';
import {
    normalizeDeckResponse,
    parseCategoriesResponse,
    resolvePersistedChoice,
    sortDeckNames,
} from './useCases/deckUseCases';

const preloadState = {
    email: null,
    promise: null,
    data: null,
};

const getPreferredCategory = (resumeSessionCategory, categories) => {
    if (resumeSessionCategory && categories.includes(resumeSessionCategory)) {
        return resumeSessionCategory;
    }
    return resolvePersistedChoice(LAST_CATEGORY_KEY, categories, categories[0] ?? null);
};

const getPreferredDeck = (category, resumeSessionDeck, deckNames) => {
    if (resumeSessionDeck && deckNames.includes(resumeSessionDeck)) {
        return resumeSessionDeck;
    }
    return resolvePersistedChoice(`${LAST_DECK_KEY_PREFIX}${category}`, deckNames, deckNames[0] ?? null);
};

/**
 * Precarga silenciosa del arranque de Flashcards.
 * Se ejecuta desde onboarding para que categorías, decks y el primer deck lleguen cacheados.
 */
export async function preloadFlashcardStart(userEmail, resumeSession = null) {
    if (!userEmail) return null;
    if (preloadState.email === userEmail && preloadState.promise) {
        return preloadState.promise;
    }

    const promise = (async () => {
        const categoriesResult = await flashcardPort.fetchCategories();
        const { names, totals } = parseCategoriesResponse(categoriesResult);
        const categories = sortCategories(names);
        const resolvedCategories = categories.length > 0 ? categories : [...FALLBACK_CATEGORIES];
        const category = getPreferredCategory(resumeSession?.category, resolvedCategories);

        let deckNames = [];
        let deck = null;
        let deckData = null;

        if (category) {
            const decksResult = await flashcardPort.fetchDecksForCategory(category);
            deckNames = decksResult?.success && Array.isArray(decksResult.files)
                ? sortDeckNames(decksResult.files)
                : [];
            deck = getPreferredDeck(category, resumeSession?.deck, deckNames);

            if (deck) {
                const rawDeck = await flashcardPort.fetchDeckData(userEmail, category, deck);
                deckData = normalizeDeckResponse(rawDeck);
            }
        }

        const data = {
            categories: resolvedCategories,
            categoryTotals: totals,
            category,
            deck,
            deckNames,
            deckData,
        };

        preloadState.data = data;
        return data;
    })().catch((error) => {
        console.error('No se pudo precargar Flashcards desde onboarding.', error);
        preloadState.data = null;
        return null;
    });

    preloadState.email = userEmail;
    preloadState.promise = promise;
    return promise;
}

/** Reutiliza la precarga en curso o la inicia si aún no existe. */
export function consumeFlashcardPreload(userEmail, resumeSession = null) {
    if (!userEmail) return Promise.resolve(null);
    if (preloadState.email === userEmail && preloadState.promise) {
        return preloadState.promise;
    }
    return preloadFlashcardStart(userEmail, resumeSession);
}

export function getFlashcardPreloadSnapshot(userEmail) {
    if (preloadState.email === userEmail && preloadState.data) {
        return preloadState.data;
    }
    return null;
}
