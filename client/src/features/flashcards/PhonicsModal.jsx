import React, { useState, useEffect } from 'react';
import styles from './PhonicsModal.module.css';
import { useAudioPlayback } from './useAudioPlayback.jsx';
import { httpClient } from '../../services/httpClient';
import { useAppContext } from '../../context/AppContext';

function PhonicsModal() {
    const { setAppMessage, setIsAudioLoading, selectedTone, setIsPhonicsModalOpen } = useAppContext();
    const [phonicsData, setPhonicsData] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);

    const { playAudio, isAudioPlaying, activeAudioText } = useAudioPlayback({
        setAppMessage, setIsAudioLoading, currentCategory: "phonics",
        currentDeckName: "phonics", selectedTone, verbName: 'phonics_sample'
    });

    useEffect(() => {
        const fetchPhonicsData = async () => {
            setIsLoading(true);
            try {
                const data = await httpClient.get('/api/phonics-data');
                if (Array.isArray(data)) setPhonicsData(data);
            } catch (err) {
                setError(err.message);
            } finally {
                setIsLoading(false);
            }
        };
        fetchPhonicsData();
    }, []);

    const onClose = () => setIsPhonicsModalOpen(false);

    const renderContent = () => {
        if (isLoading) return <div className={styles.loading}>Cargando reglas de fonética...</div>;
        if (error) return <div className={styles.error}>{error}</div>;
        if (phonicsData.length === 0) return <div className={styles.error}>No se encontraron reglas.</div>;

        return (
            <div className={styles.rulesContainer}>
                {phonicsData.map((ruleData, index) => (
                    <div key={index} className={styles.ruleBlock}>
                        <h3 className={styles.ruleTitle}>
                            <span className={styles.ruleText}>{ruleData.rule}</span>
                            <span className={styles.ruleSoundsLike}>{ruleData.sounds_like}</span>
                        </h3>
                        <div className={styles.examplesGrid}>
                            {ruleData.examples.map((example, exIndex) => {
                                const isActive = isAudioPlaying && activeAudioText === example;
                                return (
                                    <button key={exIndex} className={`${styles.exampleButton} ${isActive ? styles.activeButton : ''}`}
                                        onClick={() => playAudio(example)} disabled={isAudioPlaying}>
                                        <span className={styles.audioIcon}>{isActive ? '...' : '🔊'}</span>
                                        <div className={styles.exampleTextContainer}>
                                            <span className={styles.exampleText}>{example}</span>
                                            <span className={styles.exampleIpa}>{ruleData.ipa[exIndex]}</span>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                ))}
            </div>
        );
    };

    return (
        <div className={styles.modal} onClick={onClose}>
            <div className={styles.modalContent} onClick={e => e.stopPropagation()}>
                <button className={styles.closeButton} onClick={onClose}>&times;</button>
                {renderContent()}
            </div>
        </div>
    );
}

export default PhonicsModal;