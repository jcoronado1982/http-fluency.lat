import { createLearningStatsHttpAdapter } from './adapters/learningStatsHttpAdapter';
import { createLearningStatsPort } from './ports/learningStatsPort';
import { createDeckPreviewHttpAdapter } from './adapters/deckPreviewHttpAdapter';
import { createDeckPreviewPort } from './ports/deckPreviewPort';
import { httpClient } from '../../services/httpClient';

/** Composition root del módulo dashboard (equivalente a wiring en `api_main`). */
export const learningStatsPort = createLearningStatsPort(
    createLearningStatsHttpAdapter(httpClient),
);

export const deckPreviewPort = createDeckPreviewPort(
    createDeckPreviewHttpAdapter(httpClient),
);
