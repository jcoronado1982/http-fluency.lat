import { httpClient } from '../../services/httpClient';
import { createFlashcardPort } from './ports/flashcardPort';
import { createFlashcardHttpAdapter } from './adapters/flashcardHttpAdapter';
import { createAudioHttpAdapter, createImageHttpAdapter, createAudioPort, createImagePort } from '../../adapters';
import { imageCompressionService } from './services/imageCompressionService';

/** Composition root del módulo flashcards (equivalente a wiring en `api_main`). */
export const flashcardPort = createFlashcardPort(createFlashcardHttpAdapter(httpClient));
export const audioPort = createAudioPort(createAudioHttpAdapter(httpClient));
export const imagePort = createImagePort(createImageHttpAdapter(httpClient));
export { imageCompressionService };
