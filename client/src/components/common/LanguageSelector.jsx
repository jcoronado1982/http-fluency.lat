import React from 'react';
import styles from './LanguageSelector.module.css';

const LanguageSelector = ({ currentLanguage, onLanguageChange }) => {
    return (
        <div className={styles.container}>
            <button
                className={`${styles.option} ${currentLanguage === 'es' ? styles.active : ''}`}
                onClick={() => onLanguageChange('es')}
            >
                ES
            </button>
            <span className={styles.separator}>/</span>
            <button
                className={`${styles.option} ${currentLanguage === 'en' ? styles.active : ''}`}
                onClick={() => onLanguageChange('en')}
            >
                EN
            </button>
            <div
                className={styles.indicator}
                style={{
                    left: currentLanguage === 'es' ? '15%' : '65%'
                }}
            />
        </div>
    );
};

export default LanguageSelector;
