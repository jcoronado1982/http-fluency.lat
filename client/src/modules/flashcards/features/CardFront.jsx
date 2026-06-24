import React, { useRef, useState } from 'react';
import styles from './Flashcard.module.css';
import HighlightedText from './HighlightedText';
import ConjugationTable from './ConjugationTable';
import ImageViewer from './ImageViewer';
import DefinitionList from './DefinitionList';
import { FaSpinner } from 'react-icons/fa';
import { FiPlay, FiHeadphones, FiZap, FiRefreshCw } from 'react-icons/fi';
import { useAuth } from '../../../context/AuthContext';
import { getCardTitle, getAudioLang } from './cardLanguageUtils';

// ---------------------------------------------------------------------------
// Mapa de formas verbales → datos a mostrar (OCP: extensible sin modificar)
// ---------------------------------------------------------------------------
const DISPLAY_DATA_MAP = {
    v1: (card) => ({
        name: card.name,
        phonetic: card.phonetic,
        definitions: card.definitions || [],
    }),
    v2: (card) => {
        const past = card.irregular?.past;
        if (!past) return null;
        const defs = Array.isArray(past.definitions)
            ? past.definitions
            : past.usage_example ? [{ usage_example: past.usage_example, usage_example_es: past.usage_example_es, pronunciation_guide_es: past.pronunciation_guide_es }]
            : [];
        return { name: past.form || card.name, phonetic: past.phonetic || '', definitions: defs };
    },
    v3: (card) => {
        const part = card.irregular?.participle;
        if (!part) return null;
        const defs = Array.isArray(part.definitions)
            ? part.definitions
            : part.usage_example ? [{ usage_example: part.usage_example, usage_example_es: part.usage_example_es, pronunciation_guide_es: part.pronunciation_guide_es }]
            : [];
        return { name: part.form || card.name, phonetic: part.phonetic || '', definitions: defs };
    },
};

/**
 * CardFront — orquestador de presentación.
 * SRP: solo compone sub-componentes. No tiene lógica de HTTP ni estado complejo.
 */
function CardFront({
    cardData,
    onOpenIpaModal,
    playAudio,
    playDefinitionMedia,
    activeAudioText,
    highlightedWordIndex,
    blurredState,
    toggleBlur,
    isImageLoading,
    isGeneratingImage,
    imageUrl,
    imageRef,
    deleteImage,
    uploadImage,
    handleImageError,
    canCustomizeImages,
    canDeleteImages,
    deleteAudio,
    isGeneratingAudio,
    activeForm,
    onConjugationSelect,
    currentLanguage,
}) {
    const [isUploading, setIsUploading] = useState(false);
    const uploadInputRef = useRef(null);
    const { user } = useAuth();
    const isAdmin = user?.role === 'admin';

    const displayData = (DISPLAY_DATA_MAP[activeForm] || DISPLAY_DATA_MAP.v1)(cardData);
    const isDisabled  = isImageLoading || isUploading || isGeneratingAudio;

    const handleFileChange = async (e) => {
        e.stopPropagation();
        const file = e.target.files[0];
        if (file) {
            setIsUploading(true);
            try { await uploadImage(file); }
            finally { setIsUploading(false); }
        }
        e.target.value = null;
    };

    const triggerUpload = (e) => {
        e.stopPropagation();
        uploadInputRef.current?.click();
    };

    const handleRotateVoice = (e, text, lang = getAudioLang(currentLanguage)) => {
        e.stopPropagation();
        deleteAudio(text, lang);
    };

    if (!displayData) return null;

    const title = getCardTitle(displayData, currentLanguage);

    return (
        <div className={styles.cardFront}>
            {/* Nombre + botón borrar audio */}
            <h2 className={styles.name}>
                <div className={styles.nameContainer}>
                    {cardData.irregular && <FiZap className={styles.irregularIcon} title="Verbo Irregular" />}
                    <div className={styles.titleContainer}>
                        <HighlightedText
                            text={title}
                            activeAudioText={activeAudioText}
                            highlightedWordIndex={highlightedWordIndex}
                        />
                        {isAdmin && !(isGeneratingAudio && activeAudioText === title) && (
                            <button
                                className={styles.rotateVoiceBtn}
                                onClick={(e) => handleRotateVoice(e, title, getAudioLang(currentLanguage))}
                                title="Actualizar voz aleatoria"
                                disabled={isDisabled}
                            >
                                <FiRefreshCw size={18} />
                            </button>
                        )}
                    </div>
                    <button
                        className={`${styles.soundButton} ${isGeneratingAudio && activeAudioText === title ? styles.loadingAudioBtn : ''}`}
                        onClick={(e) => { e.stopPropagation(); playDefinitionMedia(0, title, getAudioLang(currentLanguage)); }}
                        disabled={isGeneratingAudio}
                    >
                        {isGeneratingAudio && activeAudioText === title
                            ? <FaSpinner className={styles.spinner} />
                            : <FiPlay size={22} />}
                    </button>
                </div>
            </h2>

            {/* Fonética */}
            {currentLanguage === 'es' && (
                <div className={styles.phoneticContainer}>
                    <span className={styles.phonetic}>{displayData.phonetic}</span>
                    <button
                        type="button"
                        className={styles.ipaChartBtn}
                        onClick={(e) => { e.stopPropagation(); onOpenIpaModal(); }}
                        disabled={isDisabled}
                        title="Tabla IPA"
                    >
                        <FiHeadphones size={18} />
                    </button>
                </div>
            )}

            {/* Tabla de conjugación (componente propio) */}
            <ConjugationTable
                cardData={cardData}
                activeForm={activeForm}
                onConjugationSelect={onConjugationSelect}
                activeAudioText={activeAudioText}
                isGeneratingAudio={isGeneratingAudio}
                currentLanguage={currentLanguage}
            />

            {/* Lista de definiciones (componente propio) */}
            <DefinitionList
                definitions={displayData.definitions}
                blurredState={blurredState}
                toggleBlur={toggleBlur}
                playDefinitionMedia={playDefinitionMedia}
                deleteAudio={deleteAudio}
                activeAudioText={activeAudioText}
                highlightedWordIndex={highlightedWordIndex}
                isDisabled={isDisabled}
                isGeneratingAudio={isGeneratingAudio}
                currentLanguage={currentLanguage}
            />

            {/* Input oculto para upload */}
            <input
                type="file"
                ref={uploadInputRef}
                onChange={handleFileChange}
                style={{ display: 'none' }}
                accept="image/*"
                disabled={isDisabled}
                onClick={(e) => e.stopPropagation()}
            />

            {/* Visor de imagen (componente propio) */}
            <ImageViewer
                isImageLoading={isImageLoading}
                isGeneratingImage={isGeneratingImage}
                isUploading={isUploading}
                imageUrl={imageUrl}
                imageKey={activeForm}
                imageRef={imageRef}
                altText={title}
                onDelete={deleteImage}
                onUploadClick={triggerUpload}
                onImageError={handleImageError}
                canCustomizeImages={canCustomizeImages}
                canDeleteImages={canDeleteImages}
                isDisabled={isDisabled}
            />
        </div>
    );
}

export default CardFront;
