import React, { useState, useEffect, useRef } from 'react';
import styles from './ImageViewer.module.css';
import { FaTimes, FaUpload, FaSyncAlt } from 'react-icons/fa';
import { FiCpu } from 'react-icons/fi';

/**
 * ImageViewer — responsable ÚNICAMENTE de la visualización y controles de imagen.
 * SRP: no conoce lógica de formas verbales ni audio.
 */
function ImageViewer({ isImageLoading, isGeneratingImage, isUploading, imageUrl, imageRef, altText, onDelete, onRegenerate, onUploadClick, onImageError, canCustomizeImages, canDeleteImages = canCustomizeImages, isDisabled, imageKey, isLandingDemo = false }) {
    console.log('[ImageViewer] props:', { isImageLoading, isGeneratingImage, isUploading, imageUrl });
    const isProcessActive = isImageLoading || isUploading;
    const [isDecoding, setIsDecoding] = useState(true);
    const activeUrlRef = useRef(imageUrl);

    const handleImageLoad = () => {
        console.log('[ImageViewer] handleImageLoad');
        setIsDecoding(false);
    };

    const handleImageError = () => {
        setIsDecoding(false);
        if (activeUrlRef.current === imageUrl) {
            onImageError?.();
        }
    };

    useEffect(() => {
        activeUrlRef.current = imageUrl;
        let timeout;

        if (!imageUrl) {
            setIsDecoding(true);
            return undefined;
        }
        
        setIsDecoding(true);
        if (imageRef?.current?.complete && imageRef.current.naturalWidth > 0) {
            setIsDecoding(false);
        }
        
        // Fallback de seguridad: si el navegador se queda "colgado" decodificando (bug de Chrome con AVIF),
        // quitamos el loader después de 5 segundos para que no quede la pantalla bloqueada.
        timeout = setTimeout(() => {
            setIsDecoding((prev) => {
                if (prev) {
                    console.warn('Timeout decodificando imagen, forzando visualización:', imageUrl);
                    return false;
                }
                return prev;
            });
        }, 5000);
        
        return () => {
            if (timeout) clearTimeout(timeout);
        };
    }, [imageUrl, imageKey, imageRef]);

    const showLoader = isProcessActive || (imageUrl && isDecoding);
    const showImageControls = imageUrl && !isProcessActive;

    const attachRef = (el) => {
        if (imageRef) imageRef.current = el;
        if (el?.complete && el.naturalWidth > 0) {
            setIsDecoding(false);
        }
    };

    return (
        <div className={styles.imagePlaceholder}>
            {/* Controles: eliminar o subir */}
            {(canDeleteImages || canCustomizeImages) && (
                <div className={styles.imageControls}>
                    {showImageControls ? (
                        <>
                            {canCustomizeImages && (
                                <button
                                    className={`${styles.imageControlBtn} ${styles.regenerateImageBtn}`}
                                    onClick={(e) => { e.stopPropagation(); onRegenerate?.(); }}
                                    title="Regenerar imagen con IA"
                                    disabled={isDisabled}
                                >
                                    <FaSyncAlt size={16} />
                                </button>
                            )}
                            {canDeleteImages && (
                                <button
                                    className={`${styles.imageControlBtn} ${styles.deleteImageBtn}`}
                                    onClick={(e) => { e.stopPropagation(); onDelete(); }}
                                    title="Eliminar imagen actual"
                                    disabled={isDisabled}
                                >
                                    <FaTimes size={20} />
                                </button>
                            )}
                        </>
                    ) : (
                        <>
                            {canCustomizeImages && (
                                <button
                                    className={`${styles.imageControlBtn} ${styles.regenerateImageBtn}`}
                                    onClick={(e) => { e.stopPropagation(); onRegenerate?.(); }}
                                    title="Generar imagen con IA"
                                    disabled={isDisabled}
                                >
                                    <FaSyncAlt size={16} />
                                </button>
                            )}
                            {canCustomizeImages && (
                                <button
                                    className={`${styles.imageControlBtn} ${styles.uploadImageBtn}`}
                                    onClick={onUploadClick}
                                    title="Subir imagen desde el equipo"
                                    disabled={isDisabled}
                                >
                                    <FaUpload size={18} />
                                </button>
                            )}
                        </>
                    )}
                </div>
            )}

            {/* Animación de Carga (Superpuesta) */}
            {showLoader && (
                <div className={styles.imageLoadingOverlay}>
                    <div className={styles.loaderVisualContainer}>
                        <div className={styles.aiLoaderGlow} />
                        <div className={styles.aiLoaderCircle} />
                        <div className={styles.aiLoaderCircleInner} />
                        <FiCpu className={styles.aiLoaderIcon} />
                    </div>
                    <div className={styles.aiLoaderTextContainer}>
                        <h4 className={styles.aiLoaderText}>
                            {isGeneratingImage ? 'Generating image...' : 'Loading image...'}
                        </h4>
                    </div>
                </div>
            )}

            {/* Visualizador de la imagen (Oculta si está decodificando) */}
            {imageUrl ? (
                <img
                    key={imageKey ? `${imageKey}-${imageUrl}` : imageUrl}
                    ref={attachRef}
                    className={`${styles.image} ${styles.imageVisible}`}
                    src={imageUrl}
                    alt={altText || 'Flashcard image'}
                    onLoad={handleImageLoad}
                    onError={handleImageError}
                    style={{ '--image-opacity': isDecoding ? 0 : 1 }}
                />
            ) : !isProcessActive && !isLandingDemo && (
                <img
                    src="/noimages.png"
                    alt="Image not available"
                    className={styles.noImagePlaceholderImg}
                />
            )}
        </div>
    );
}

export default ImageViewer;
