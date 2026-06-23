import { API_URL } from '../../../config/api';
import { httpClient } from '../../../services/httpClient';

function getAuthHeader() {
    const token = localStorage.getItem('auth_token');
    return token ? { 'Authorization': `Bearer ${token}` } : {};
}

export const imageRepository = {
    // POST /api/resolve-image — capa personal (premium) o global (predeterminada), sin generar
    resolve: async ({ category, deck, index, defIndex, form }) => {
        const data = await httpClient.post('/api/resolve-image', {
            category,
            deck,
            index,
            def_index: defIndex,
            form: form && form !== 'v1' ? form : undefined,
        });
        if (!data?.path) throw new Error('Sin ruta de imagen en la respuesta');
        return data;
    },

    // POST /api/generate-image — recupera imagen de GCS o genera una nueva con IA
    generate: async ({ category, deck, index, defIndex, form, prompt, meaning, usageExample, forceGeneration }) => {
        const data = await httpClient.post('/api/generate-image', {
            category,
            deck,
            index,
            def_index: defIndex,
            form,
            prompt,
            meaning,
            usage_example: usageExample,
            force_generation: forceGeneration,
        });
        if (!data?.path) throw new Error('Sin ruta de imagen en la respuesta');
        return data;
    },

    // DELETE /api/delete-image — borra el archivo del bucket GCS
    delete: async ({ category, deck, index, defIndex, form }) => {
        try {
            return await httpClient.delete('/api/delete-image', { category, deck, index, def_index: defIndex, form });
        } catch (err) {
            throw new Error(err.message || 'Error en el servidor al eliminar');
        }
    },

    // POST /api/upload-image — sube imagen local al bucket GCS
    upload: async (file, { category, deck, cardIndex, defIndex, form }) => {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('category', category);
        formData.append('deck', deck);
        formData.append('card_index', cardIndex);
        formData.append('def_index', defIndex);
        if (form) formData.append('form', form);

        const res = await fetch(`${API_URL}/api/upload-image`, {
            method: 'POST',
            headers: getAuthHeader(),
            body: formData,
        });

        if (!res.ok) {
            const errorData = await res.json().catch(() => ({}));
            throw new Error(errorData.detail || 'Error en el servidor al subir la imagen.');
        }

        const data = await res.json();
        if (!data?.path) throw new Error('Sin ruta de imagen en la respuesta de subida.');
        return data;
    },

    // Ruta AVIF global predeterminada (capa compartida por todos los usuarios).
    buildGlobalStoragePath: ({ category, deck, index, defIndex, form }) => {
        const deckPrefix = deck.replace('.json', '');
        const formSuffix = form && form !== 'v1' ? `_${form}` : '';
        return `/card_images/${category}/${deckPrefix}/${deckPrefix}_card_${index}_def${defIndex}${formSuffix}.avif`;
    },

    // Normaliza paths legacy (.jpg/.png) al AVIF optimizado que realmente existe en storage.
    normalizeToAvif: (path) => {
        if (!path) return path;
        if (path.endsWith('.avif')) return path.split('?')[0];
        return path.replace(/\.(png|jpg|jpeg|webp)$/i, '.avif').split('?')[0];
    },

    // Construye URL absoluta dado un path relativo AVIF.
    // forceCacheBust se usa solo al generar o subir una nueva imagen para saltar la caché.
    buildUrl: (path, forceCacheBust = false) => {
        if (!path) return null;
        const cleanPath = imageRepository.normalizeToAvif(path);
        const base = cleanPath.startsWith('http') ? cleanPath : `${API_URL}${cleanPath.startsWith('/') ? cleanPath : '/' + cleanPath}`;
        if (!forceCacheBust) return base;

        const sep = base.includes('?') ? '&' : '?';
        return `${base}${sep}t=${Date.now()}`;
    },

    // Comprueba que la imagen es accesible vía same-origin (sin CORS cross-domain).
    verifyAccessible: async (path, forceCacheBust = false) => {
        try {
            await imageRepository.preloadImage(path, forceCacheBust);
            return true;
        } catch {
            return false;
        }
    },

    // Preload completo (decodifica en memoria). Solo para subidas/regeneraciones explícitas.
    preloadImage: (path, forceCacheBust = false) => {
        const url = imageRepository.buildUrl(path, forceCacheBust);
        if (!url) return Promise.reject(new Error('Ruta de imagen vacía'));

        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(url);
            img.onerror = () => reject(new Error(`No se pudo cargar: ${url}`));
            img.src = url;
        });
    },
};
