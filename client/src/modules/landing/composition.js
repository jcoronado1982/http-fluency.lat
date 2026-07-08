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

/** Puerto de reseñas del demo (contrato) — la UI no toca httpClient directo. */
export const demoFeedbackPort = Object.freeze({
    fetchRecent: (limit = 20) => httpClient.get(`/api/demo-feedback?limit=${limit}`),
    submit: ({ comment, rating, language }) => httpClient.post('/api/demo-feedback', {
        comment,
        rating,
        language,
        source: 'landing-demo',
    }),
});

export { LANDING_DEMO_MEDIA };
