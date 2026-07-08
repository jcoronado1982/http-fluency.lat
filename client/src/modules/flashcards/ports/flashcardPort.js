/**
 * Puerto de flashcards (contrato de aplicación).
 * Equivalente frontend de los traits en `fluency_core::ports`.
 *
 * @typedef {object} FlashcardPort
 * @property {() => Promise<unknown>} fetchCategories
 * @property {(category: string) => Promise<unknown>} fetchDecksForCategory
 * @property {(userId: string, category: string, deck: string) => Promise<unknown>} fetchDeckData
 * @property {(userId: string, category: string, deck: string, index: number, learned: boolean) => Promise<unknown>} updateCardStatus
 * @property {(userId: string, category: string, deck: string, cards: Array<{index: number, learned: boolean}>) => Promise<unknown>} updateCardsBatch
 * @property {(userId: string, category: string, deck: string) => Promise<unknown>} resetDeckStatus
 * @property {(userId: string, category: string, deck?: string) => Promise<unknown>} resetCategoryStatus
 * @property {() => Promise<unknown>} fetchPhonicsData
 */

/** @param {FlashcardPort} adapter */
export function createFlashcardPort(adapter) {
    return Object.freeze({ ...adapter });
}
