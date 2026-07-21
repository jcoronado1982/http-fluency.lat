/**
 * Puerto del tutor IA (shell compartido, consumido por el módulo).
 */

/** @param {object} adapter */
export function createTutorPort(adapter) {
    return Object.freeze({ ...adapter });
}
