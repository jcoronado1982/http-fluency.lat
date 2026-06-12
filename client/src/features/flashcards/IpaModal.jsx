// src/features/flashcards/IpaModal.jsx
import React from 'react';
import styles from './IpaModal.module.css'; // Import the CSS Module

// --- Data for the modal ---
// Se muestra "uː" en pantalla (correcto) pero se usa el audio original "u-.mp4"
const ipaSymbols = ['i', 'ɪ', 'ɛ', 'æ', 'ɑ', 'ʌ', 'ɚ', 'ɔ', 'o', 'uː', 'ʊ', 'ɝ'];

const symbolPositions = {
    'i': 'ipa-i-long', 'ɪ': 'ipa-i-short', 'ɛ': 'ipa-e', 'æ': 'ipa-ae',
    'ɚ': 'ipa-schwa', 'ʌ': 'ipa-uh', 'ɑ': 'ipa-a-long', 'ɔ': 'ipa-o-long',
    'ʊ': 'ipa-u-short', 'uː': 'ipa-u-long', 'o': 'ipa-o-short', 'ɝ': 'ipa-er'
};

// ✅ Aquí se mantiene el mismo archivo de audio "u-.mp4"
const symbolToFileNameMap = {
    'i': 'i-', 'ɪ': 'ɪ', 'ɛ': 'e', 'æ': 'æ', 'ɑ': 'ɑ-', 'ʌ': 'ʌ', 'ɚ': 'ə',
    'ɔ': 'ɔ-', 'o': 'ɒ', 'uː': 'u-', 'ʊ': 'ʊ', 'ɝ': 'ɜ-'
};
// --- End Data ---

function IpaModal({ onClose }) {

    const speakIPA = (symbol) => {
        const fileName = symbolToFileNameMap[symbol];
        if (!fileName) {
            console.error(`No audio file name mapped for IPA symbol: ${symbol}`);
            return;
        }
        const audio = new Audio(`/audio/${fileName}.mp4`);
        audio.play().catch(e => console.error(`Error playing /audio/${fileName}.mp4:`, e));
    };

    return (
        <div className={styles.modal} onClick={onClose}>
            <div className={styles.modalContent} onClick={e => e.stopPropagation()}>
                <button className={styles.closeButton} onClick={onClose}>&times;</button>
                <h2 style={{ textAlign: 'center', margin: '12px', color: '#333' }}>Vowel Chart</h2>

                <div className={styles.ipaChart}>
                    {ipaSymbols.map(symbol => (
                        <button
                            key={symbol}
                            id={symbolPositions[symbol]}
                            className={styles.ipaBtn}
                            onClick={() => speakIPA(symbol)}
                        >
                            {symbol}
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}

export default IpaModal;
