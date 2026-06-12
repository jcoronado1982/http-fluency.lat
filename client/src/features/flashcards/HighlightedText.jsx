// src/features/flashcards/HighlightedText.jsx
import React from 'react';
import styles from './Flashcard.module.css'; // Reutilizamos los estilos de Flashcard

function HighlightedText({ text, activeAudioText, highlightedWordIndex }) {
    if (!text) return null;

    const words = text.split(' ');
    const isActive = activeAudioText === text;

    return (
        <>
            {words.map((word, index) => (
                <span
                    key={index}
                    className={
                        isActive && highlightedWordIndex === index
                            ? styles.highlightedWord
                            : ''
                    }
                >
                    {word}{' '}
                </span>
            ))}
        </>
    );
}

export default React.memo(HighlightedText); // Usamos memo para optimizar