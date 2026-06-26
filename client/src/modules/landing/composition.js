import {
    createAudioHttpAdapter,
    createImageHttpAdapter,
    createAudioPort,
    createImagePort,
} from '../../adapters';
import { httpClient } from '../../services/httpClient';
import { LANDING_DEMO_MEDIA } from '../../contracts/studyMediaVariants';

/**
 * Composition root del landing demo.
 * Los adapters HTTP son los mismos que la app; la variante ElevenLabs + Gemini
 * la activa el backend cuando `category === landing-demo` (ver LANDING_DEMO_MEDIA).
 */
export const demoAudioPort = createAudioPort(createAudioHttpAdapter(httpClient));
export const demoImagePort = createImagePort(createImageHttpAdapter(httpClient));

export { LANDING_DEMO_MEDIA };
