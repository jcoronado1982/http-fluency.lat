import init, { encode_avif } from './wasm_lib.js';
import heic2any from 'heic2any';

let wasmLoaded = false;

// Inicialización asíncrona segura de WASM
async function loadWasm() {
    if (wasmLoaded) return;
    try {
        await init();
        wasmLoaded = true;
    } catch (e) {
        console.error('[WASM Compresor] Error crítico al cargar el módulo:', e);
    }
}

// Inicializar de fondo
loadWasm().catch(console.error);

export const imageCompressionService = {
    /**
     * Comprime y optimiza un archivo de imagen en el cliente.
     * Convierte HEIC -> JPEG si es necesario, escala a un máx de 1200px de dimensión,
     * y comprime a formato AVIF usando APIs nativas o motor WASM como fallback.
     * 
     * @param {File} file Archivo original a comprimir
     * @param {number} [quality=0.80] Calidad de compresión (0.0 a 1.0)
     * @returns {Promise<Blob>} Blob comprimido en formato AVIF (o JPEG en caso de fallo crítico de fallback)
     */
    compress: async (file, quality = 0.80) => {
        let currentFile = file;

        // 1. Conversión de HEIC si es necesario
        if (file.name.toLowerCase().endsWith('.heic')) {
            try {
                const convertedBlob = await heic2any({
                    blob: file,
                    toType: 'image/jpeg',
                    quality: 0.85
                });
                const singleBlob = Array.isArray(convertedBlob) ? convertedBlob[0] : convertedBlob;
                currentFile = new File([singleBlob], file.name.replace(/\.[^/.]+$/, "") + ".jpg", { type: "image/jpeg" });
            } catch (e) {
                console.error('[Compresor] Fallo al convertir HEIC:', e);
                throw new Error('No se pudo decodificar el archivo HEIC.');
            }
        }

        // Aseguramos que el WASM esté cargado por si se requiere como fallback
        await loadWasm();

        // 2. Cargar imagen en un Canvas para reescalar
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (event) => {
                const img = new Image();
                img.onload = async () => {
                    try {
                        const canvas = document.createElement('canvas');
                        
                        // Reescalado inteligente: Dimensión máxima de 1200px para flashcards
                        const maxDimension = 1200;
                        const maxOriginalDim = Math.max(img.width, img.height);
                        const scale = Math.min(maxDimension / maxOriginalDim, 1.0);

                        canvas.width = Math.round(img.width * scale);
                        canvas.height = Math.round(img.height * scale);

                        const ctx = canvas.getContext('2d');
                        if (!ctx) throw new Error('No se pudo obtener contexto 2D del Canvas.');
                        
                        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

                        // 3. Intentar codificación AVIF nativa del navegador
                        let compressedBlob = await new Promise((r) => canvas.toBlob(r, 'image/avif', quality));
                        
                        if (compressedBlob && compressedBlob.type === 'image/avif') {
                            resolve(compressedBlob);
                            return;
                        }

                        // 4. Fallback a codificación por software con WebAssembly (Rust Engine)
                        console.warn('[Compresor] Codificación nativa AVIF no soportada. Iniciando motor WASM...');
                        if (!wasmLoaded) {
                            throw new Error('Motor de compresión WebAssembly no está listo.');
                        }

                        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                        const rgbaData = new Uint8Array(imageData.data.buffer);
                        const qualityPercentage = Math.round(quality * 100);

                        const avifBytes = encode_avif(rgbaData, canvas.width, canvas.height, qualityPercentage);
                        const avifBlob = new Blob([avifBytes], { type: 'image/avif' });
                        resolve(avifBlob);

                    } catch (err) {
                        console.error('[Compresor] Error crítico durante la compresión:', err);
                        // Fallback absoluto: Si todo falla, resolver con el archivo original
                        resolve(currentFile);
                    }
                };
                img.onerror = () => reject(new Error('Fallo al cargar imagen para procesamiento.'));
                img.src = event.target.result;
            };
            reader.onerror = () => reject(new Error('Fallo al leer el archivo de imagen.'));
            reader.readAsDataURL(currentFile);
        });
    }
};
