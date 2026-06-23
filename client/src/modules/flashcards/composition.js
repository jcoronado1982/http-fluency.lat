import { httpClient } from '../../services/httpClient';
import { createFlashcardPort } from './ports/flashcardPort';
import { createFlashcardHttpAdapter } from './adapters/flashcardHttpAdapter';
import { audioRepository as audioHttpAdapter } from './adapters/audioHttpAdapter';
import { imageRepository as imageHttpAdapter } from './adapters/imageHttpAdapter';

/** Composition root del módulo flashcards (equivalente a wiring en `api_main`). */
export const flashcardPort = createFlashcardPort(createFlashcardHttpAdapter(httpClient));

/** Alias legacy — preferir `flashcardPort`. */
export const flashcardRepository = flashcardPort;

export const audioPort = audioHttpAdapter;
export const imagePort = imageHttpAdapter;

/** @deprecated use audioPort */
export const audioRepository = audioPort;

/** @deprecated use imagePort */
export const imageRepository = imagePort;
