import { httpClient } from '../../services/httpClient';
import { createStoryPort } from './ports/storyPort';
import { createTutorPort } from './ports/tutorPort';
import { createStoryHttpAdapter } from './adapters/storyHttpAdapter';
import { createTutorHttpAdapter } from './adapters/tutorHttpAdapter';

/** Composition root del módulo pronounPractice. */
export const storyPort = createStoryPort(createStoryHttpAdapter(httpClient));
export const tutorPort = createTutorPort(createTutorHttpAdapter(httpClient));

/** Alias legacy */
export const tutorRepository = tutorPort;
