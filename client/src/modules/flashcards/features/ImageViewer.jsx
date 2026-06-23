import React, { useState, useEffect, useRef } from 'react';
import styles from './Flashcard.module.css';
import { FaTimes, FaUpload } from 'react-icons/fa';
import { FiCpu } from 'react-icons/fi';

/**
 * ImageViewer — responsable ÚNICAMENTE de la visualización y controles de imagen.
 * SRP: no conoce lógica de formas verbales ni audio.
 */
function ImageViewer({ isImageLoading, isGeneratingImage, isUploading, imageUrl, imageRef, altText, onDelete, onUploadClick, onImageError, canCustomizeImages, isDisabled, imageKey }) {
    const isProcessActive = isImageLoading || isUploading;
    const [isDecoding, setIsDecoding] = useState(true);
    const activeUrlRef = useRef(imageUrl);

    const handleImageLoad = () => setIsDecoding(false);

    const handleImageError = () => {
        setIsDecoding(false);
        if (activeUrlRef.current === imageUrl) {
            onImageError?.();
        }
    };

    useEffect(() => {
        activeUrlRef.current = imageUrl;
        let timeout;
        
        if (imageUrl) {
            setIsDecoding(true);
            // Re-evaluar por si el elemento ya está completo en el DOM
            if (imageRef && imageRef.current && imageRef.current.complete) {
                if (imageRef.current.naturalWidth > 0) {
                    setIsDecoding(false);
                } else if (imageRef.current.naturalWidth === 0 && imageRef.current.src) {
                    setIsDecoding(false);
                    if (activeUrlRef.current === imageUrl) {
                        onImageError?.();
                    }
                }
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
        }
        
        return () => {
            if (timeout) clearTimeout(timeout);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [imageUrl, imageRef]);

    const showLoader = isProcessActive || (imageUrl && isDecoding);
    const showImageControls = imageUrl && !isProcessActive;

    const attachRef = (el) => {
        if (imageRef) imageRef.current = el;
        if (el && el.complete) {
            if (el.naturalWidth > 0) {
                setIsDecoding(false);
            } else if (el.naturalWidth === 0 && el.src) {
                // La imagen dice estar completa pero no tiene dimensiones (error desde caché)
                // Usamos setTimeout para no alterar el estado durante el render cycle del ref
                setTimeout(() => {
                    handleImageError();
                }, 0);
            }
        }
    };

    return (
        <div className={styles.imagePlaceholder}>
            {/* Controles: eliminar o subir */}
            {canCustomizeImages && (
                <div className={styles.imageControls}>
                    {showImageControls ? (
                        <button
                            className={`${styles.imageControlBtn} ${styles.deleteImageBtn}`}
                            onClick={(e) => { e.stopPropagation(); onDelete(); }}
                            title="Eliminar imagen actual"
                            disabled={isDisabled}
                        >
                            <FaTimes size={20} />
                        </button>
                    ) : (
                        <button
                            className={`${styles.imageControlBtn} ${styles.uploadImageBtn}`}
                            onClick={onUploadClick}
                            title="Subir imagen desde el equipo"
                            disabled={isDisabled}
                        >
                            <FaUpload size={18} />
                        </button>
                    )}
                </div>
            )}

            {/* Animación de Carga (Superpuesta) */}
            {showLoader && (
                <div className={styles.imageLoadingOverlay} style={{ position: 'absolute', zIndex: 10, width: '100%', height: '100%' }}>
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
                    style={{
                        opacity: isDecoding ? 0 : 1,
                        transition: 'opacity 0.3s ease-in-out',
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover' // Asegura que cubra el placeholder
                    }}
                />
            ) : !isProcessActive && (
                <img
                    src="https://placehold.co/600x400/e9ecef/6c757d?text=No+Image"
                    alt="Image not available"
                    className={styles.noImagePlaceholderImg}
                />
            )}
        </div>
    );
}

export default ImageViewer;
