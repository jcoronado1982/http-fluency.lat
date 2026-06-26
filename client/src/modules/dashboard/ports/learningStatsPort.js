/** Contrato de estadísticas de aprendizaje expuesto al dashboard. */
export function createLearningStatsPort(adapter) {
    return {
        fetchLearningStats: () => adapter.fetchLearningStats(),
        touchStudyDay: () => adapter.touchStudyDay(),
    };
}
