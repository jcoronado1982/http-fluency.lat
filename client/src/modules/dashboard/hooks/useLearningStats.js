import { useCallback, useEffect, useState } from 'react';
import { learningStatsPort } from '../composition';

const LEARNING_STATS_TIMEOUT_MS = 8000;

export function useLearningStats(isAuthenticated, courseDirection = 'es_en') {
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const refresh = useCallback(async () => {
        if (!isAuthenticated) {
            setStats(null);
            setLoading(false);
            return;
        }
        setLoading(true);
        setError(null);
        try {
            const result = await Promise.race([
                learningStatsPort.fetchLearningStats(courseDirection),
                new Promise((_, reject) => {
                    window.setTimeout(() => {
                        reject(new Error('learning_stats_timeout'));
                    }, LEARNING_STATS_TIMEOUT_MS);
                }),
            ]);
            if (result?.success && result.stats) {
                setStats(result.stats);
            } else {
                setStats(null);
            }
        } catch (err) {
            setError(err);
            setStats(null);
        } finally {
            setLoading(false);
        }
    }, [courseDirection, isAuthenticated]);

    useEffect(() => {
        refresh();
    }, [refresh]);

    return { stats, loading, error, refresh };
}
