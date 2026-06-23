/**
 * Puerto de progreso/historias (contrato de aplicación).
 * Equivalente frontend de `PronounPracticeRepository`.
 */

/** @param {object} adapter */
export function createStoryPort(adapter) {
    return Object.freeze({ ...adapter });
}
