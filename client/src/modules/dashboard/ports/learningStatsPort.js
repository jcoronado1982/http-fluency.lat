/** Contrato de estadísticas de aprendizaje expuesto al dashboard. */
export function createLearningStatsPort(adapter) {
    return {
        fetchLearningStats: (courseDirection) => adapter.fetchLearningStats(courseDirection),
        touchStudyDay: () => adapter.touchStudyDay(),
    };
}
