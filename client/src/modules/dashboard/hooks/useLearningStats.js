import { useCallback, useEffect, useState } from 'react';
import { learningStatsPort } from '../composition';

export function useLearningStats(isAuthenticated) {
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
            const result = await learningStatsPort.fetchLearningStats();
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
    }, [isAuthenticated]);

    useEffect(() => {
        refresh();
    }, [refresh]);

    return { stats, loading, error, refresh };
}
