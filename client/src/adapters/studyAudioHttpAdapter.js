import { API_URL } from '../config/api';
import { httpClient } from '../services/httpClient';

export function createAudioHttpAdapter(http) {
    const normalizeCourseDirection = (courseDirection) => (
        courseDirection === 'en_es' ? 'en_es' : 'es_en'
    );

    return {
    resolve: async ({ category, deck, text, verbName, lang, courseDirection }) => {
        const data = await http.post('/api/resolve-audio', {
            category,
            deck,
            text,
            voice_name: '',
            tone: '',
            verb_name: verbName,
            lang: lang || 'en',
            course_direction: normalizeCourseDirection(courseDirection),
        });
        if (!data.audio_url) throw new Error('No audio_url in response');
        return data;
    },

    synthesize: async ({ category, deck, text, verbName, lang, excludeVoice, forceRegenerate, courseDirection }) => {
        const data = await http.post('/api/synthesize-speech', {
            category,
            deck,
            text,
            voice_name: '',
            tone: '',
            verb_name: verbName,
            lang: lang || 'en',
            course_direction: normalizeCourseDirection(courseDirection),
            exclude_voice: excludeVoice || '',
            force_regenerate: !!forceRegenerate,
        });
        if (!data.audio_url) throw new Error('No audio_url in response');
        return data;
    },

    rotate: async ({ category, deck, text, verbName, lang, courseDirection }) => {
        return http.post('/api/delete-audio', {
            category,
            deck,
            text,
            voice_name: '',
            tone: '',
            verb_name: verbName,
            lang: lang || 'en',
            course_direction: normalizeCourseDirection(courseDirection),
        });
    },

    buildUrl: (audioUrl, forceCacheBust = false) => {
        if (!audioUrl) return null;
        const base = audioUrl.startsWith('http') ? audioUrl : `${API_URL}${audioUrl.startsWith('/') ? audioUrl : '/' + audioUrl}`;
        if (!forceCacheBust) return base;

        const sep = base.includes('?') ? '&' : '?';
        return `${base}${sep}t=${Date.now()}`;
    },
    };
}

export const audioRepository = createAudioHttpAdapter(httpClient);
