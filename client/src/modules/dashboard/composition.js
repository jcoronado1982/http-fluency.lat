import { createLearningStatsHttpAdapter } from './adapters/learningStatsHttpAdapter';
import { createLearningStatsPort } from './ports/learningStatsPort';
import { httpClient } from '../../services/httpClient';

export const learningStatsPort = createLearningStatsPort(
    createLearningStatsHttpAdapter(httpClient),
);
