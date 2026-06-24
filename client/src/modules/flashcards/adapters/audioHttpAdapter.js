import { API_URL } from '../../../config/api';
import { httpClient } from '../../../services/httpClient';

export const audioRepository = {
    resolve: async ({ category, deck, text, verbName, lang }) => {
        const data = await httpClient.post('/api/resolve-audio', {
            category,
            deck,
            text,
            voice_name: '',
            tone: '',
            verb_name: verbName,
            lang: lang || 'en',
        });
        if (!data.audio_url) throw new Error('No audio_url in response');
        return data;
    },

    synthesize: async ({ category, deck, text, verbName, lang, excludeVoice, forceRegenerate }) => {
        const data = await httpClient.post('/api/synthesize-speech', {
            category,
            deck,
            text,
            voice_name: '',
            tone: '',
            verb_name: verbName,
            lang: lang || 'en',
            exclude_voice: excludeVoice || '',
            force_regenerate: !!forceRegenerate,
        });
        if (!data.audio_url) throw new Error('No audio_url in response');
        return data;
    },

    rotate: async ({ category, deck, text, verbName, lang }) => {
        return httpClient.post('/api/delete-audio', {
            category,
            deck,
            text,
            voice_name: '',
            tone: '',
            verb_name: verbName,
            lang: lang || 'en',
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
