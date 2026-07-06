import { API_URL } from '../config/api';
import { httpClient } from '../services/httpClient';

export function createImageHttpAdapter(http) {
    const getDeckMediaParts = (deck) => {
        const cleanDeck = (deck || '').replace('.json', '');
        const segments = cleanDeck.split('/').filter(Boolean);
        const mediaDir = segments.join('/') || cleanDeck;
        const filePrefix = segments.join('_') || cleanDeck;
        return { mediaDir, filePrefix };
    };

    const imageAdapter = {
    // POST /api/resolve-image — capa personal (premium) o global (predeterminada), sin generar
    resolve: async ({ category, deck, index, defIndex, form }) => {
        const data = await http.post('/api/resolve-image', {
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
    generate: async ({ category, deck, index, defIndex, form, prompt, meaning, usageExample, usageContext, alternativeExample, forceGeneration, legacyImagePath, sceneComplement }) => {
        const data = await http.post('/api/generate-image', {
            category,
            deck,
            index,
            def_index: defIndex,
            form,
            prompt,
            meaning,
            usage_example: usageExample,
            usage_context: usageContext || undefined,
            alternative_example: alternativeExample || undefined,
            force_generation: forceGeneration,
            legacy_image_path: legacyImagePath || undefined,
            scene_complement: sceneComplement || undefined,
        });
        if (!data?.path) throw new Error('Sin ruta de imagen en la respuesta');
        return data;
    },

    // DELETE /api/delete-image — borra el archivo del bucket GCS
    delete: async ({ category, deck, index, defIndex, form }) => {
        try {
            return await http.delete('/api/delete-image', { category, deck, index, def_index: defIndex, form });
        } catch (err) {
            throw new Error(err.message || 'Error en el servidor al eliminar', { cause: err });
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

        const data = await http.upload('/api/upload-image', formData);
        if (!data?.path) throw new Error('Sin ruta de imagen en la respuesta de subida.');
        return data;
    },

    // Ruta AVIF global predeterminada (capa compartida por todos los usuarios).
    buildGlobalStoragePath: ({ category, deck, index, defIndex, form }) => {
        const { mediaDir, filePrefix } = getDeckMediaParts(deck);
        const formSuffix = form && form !== 'v1' ? `_${form}` : '';
        return `/card_images/${category}/${mediaDir}/${filePrefix}_card_${index}_def${defIndex}${formSuffix}.avif`;
    },

    // Normaliza paths legacy: los JSON antiguos apuntaban a .jpg, pero los assets reales son AVIF.
    normalizeToAvif: (path) => {
        if (!path) return path;
        const cleanPath = path.split('?')[0];
        if (!cleanPath.includes('/card_images/')) return cleanPath;
        return cleanPath.replace(/\.(jpe?g|png|webp)$/i, '.avif');
    },

    // Construye URL absoluta dado un path relativo de imagen.
    // forceCacheBust se usa solo al generar o subir una nueva imagen para saltar la caché.
    buildUrl: (path, forceCacheBust = false) => {
        if (!path) return null;
        const cleanPath = imageAdapter.normalizeToAvif(path);
        const base = cleanPath.startsWith('http') ? cleanPath : `${API_URL}${cleanPath.startsWith('/') ? cleanPath : '/' + cleanPath}`;
        if (!forceCacheBust) return base;

        const sep = base.includes('?') ? '&' : '?';
        return `${base}${sep}t=${Date.now()}`;
    },

    // Comprueba que la imagen es accesible vía same-origin (sin CORS cross-domain).
    verifyAccessible: async (path, forceCacheBust = false) => {
        try {
            await imageAdapter.preloadImage(path, forceCacheBust);
            return true;
        } catch {
            return false;
        }
    },

    // Preload completo (decodifica en memoria). Solo para subidas/regeneraciones explícitas.
    preloadImage: (path, forceCacheBust = false) => {
        const url = imageAdapter.buildUrl(path, forceCacheBust);
        if (!url) return Promise.reject(new Error('Ruta de imagen vacía'));

        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(url);
            img.onerror = () => reject(new Error(`No se pudo cargar: ${url}`));
            img.src = url;
        });
    },

    /** Preload con reintentos tras generación (Oracle/CDN puede ir retrasado). */
    preloadImageWithRetry: async (path, forceCacheBust = false, { attempts = 4, delayMs = 700 } = {}) => {
        let lastErr;
        for (let i = 0; i < attempts; i += 1) {
            try {
                return await imageAdapter.preloadImage(path, forceCacheBust || i > 0);
            } catch (err) {
                lastErr = err;
                if (i < attempts - 1) {
                    await new Promise((resolve) => { setTimeout(resolve, delayMs); });
                }
            }
        }
        throw lastErr ?? new Error('No se pudo precargar la imagen');
    },
    };

    return imageAdapter;
}

export const imageRepository = createImageHttpAdapter(httpClient);
