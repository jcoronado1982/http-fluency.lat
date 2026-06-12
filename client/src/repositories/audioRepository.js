import { API_URL } from '../config/api';
import { httpClient } from '../services/httpClient';

const VOICE_POOL = ['Aoede', 'Zephyr', 'Charon', 'Callirrhoe', 'Iapetus', 'Achernar', 'Gacrux'];

// Hash determinista: mismo texto → misma voz siempre
const getHashCode = (str) => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) - hash) + str.charCodeAt(i);
        hash |= 0;
    }
    return Math.abs(hash);
};

export const audioRepository = {
    getVoice: (text) => VOICE_POOL[getHashCode(text) % VOICE_POOL.length],

    // POST /api/synthesize-speech
    synthesize: async ({ category, deck, text, tone, verbName }) => {
        const voice = audioRepository.getVoice(text);
        const data = await httpClient.post('/api/synthesize-speech', {
            category,
            deck,
            text,
            voice_name: voice,
            model_name: 'gemini-2.5-pro-tts',
            tone: tone || '',
            verb_name: verbName,
        });
        if (!data.audio_url) throw new Error('No audio_url in response');
        return data;
    },

    // POST /api/delete-audio
    delete: async ({ category, deck, text, tone, verbName }) => {
        const voice = audioRepository.getVoice(text);
        return httpClient.post('/api/delete-audio', {
            category,
            deck,
            text,
            voice_name: voice,
            tone: tone || '',
            verb_name: verbName,
        });
    },

    // Construye URL absoluta de reproducción dado un audio_url relativo
    buildUrl: (audioUrl, forceCacheBust = false) => {
        if (!audioUrl) return null;
        const base = audioUrl.startsWith('http') ? audioUrl : `${API_URL}${audioUrl.startsWith('/') ? audioUrl : '/' + audioUrl}`;
        if (!forceCacheBust) return base;
        
        const sep = base.includes('?') ? '&' : '?';
        return `${base}${sep}t=${Date.now()}`;
    },
};
