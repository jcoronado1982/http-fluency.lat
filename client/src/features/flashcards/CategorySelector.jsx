import React from 'react';
import styles from './CategorySelector.module.css';
import { useAppContext } from '../../context/AppContext';
import { useFlashcardContext } from '../../context/FlashcardContext';
import { useCategoryContext } from '../../context/CategoryContext';

// Los totales son dinámicos — vienen del contexto que obtiene el conteo real del backend

const categoryColors = {
    nouns: '#3b82f6', // blue
    verbs: '#10b981', // green
    adjectives: '#f97316', // orange/red
    adverbs: '#f59e0b', // yellow/amber
    preposition: '#8b5cf6', // purple
    pronouns: '#ec4899', // pink
    connectors: '#06b6d4', // cyan
    determinant: '#64748b', // slate
    phrasal_verbs: '#ef4444' // red
};

const formatName = (name) => {
    if (!name) return '';
    const clean = name.replace(/^\.\//, '');
    if (clean === 'preposition') return 'Prepositions';
    if (clean === 'nouns') return 'Nouns';
    if (clean === 'verbs') return 'Verbs';
    if (clean === 'adjectives') return 'Adjectives';
    if (clean === 'adverbs') return 'Adverbs';
    if (clean === 'pronouns') return 'Pronouns';
    if (clean === 'connectors') return 'Connectors';
    if (clean === 'determinant') return 'Determinants';
    if (clean === 'phrasal_verbs') return 'Phrasal Verbs';
    return clean.replace(/[_-]/g, ' ').split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
};

function CategorySelector() {
    const { 
        categories, currentCategory, changeCategory, setIsCatalogVisible 
    } = useAppContext();

    const { categoryTotals } = useCategoryContext();

    const {
        deckNames, currentDeckName, changeDeck, masterData, setSelectedGroup
    } = useFlashcardContext();

    const totalCards = masterData.length;
    const learnedCards = masterData.filter(c => c.learned).length;

    // Obtener los grupos únicos de la data cargada actualmente
    const groupsMap = {};
    masterData.forEach(card => {
        const groupName = card.group_name || 'General';
        if (!groupsMap[groupName]) {
            groupsMap[groupName] = [];
        }
        groupsMap[groupName].push(card);
    });

    const groupsList = Object.keys(groupsMap).map(name => {
        const cards = groupsMap[name];
        const total = cards.length;
        const learned = cards.filter(c => c.learned).length;
        return { name, total, learned };
    });

    // "3-advanced" contiene la subcadena "basic" → hay que evaluar advanced antes que basic.
    const getLevelFromDeckName = (deckName) => {
        if (!deckName) return 'basic';
        const lower = deckName.toLowerCase();
        if (lower.includes('advanced')) return 'advanced';
        if (lower.includes('intermediate')) return 'intermediate';
        if (lower.includes('basic')) return 'basic';
        return 'basic';
    };

    const activeLevel = getLevelFromDeckName(currentDeckName);

    const handleLevelChange = (level) => {
        const targetDeck = deckNames.find((name) => getLevelFromDeckName(name) === level);
        if (targetDeck) {
            changeDeck(targetDeck);
        }
    };

    const handleCategoryClick = (category) => {
        changeCategory(category);
    };

    const handleGroupClick = (groupName) => {
        setSelectedGroup(groupName === 'General' ? null : groupName);
        setIsCatalogVisible(false);
    };

    return (
        <div className={styles.categorySelectorOverlay}>
            <div className={styles.dashboardContainer}>
                {/* Botón de cerrar */}
                <button className={styles.closeBtn} onClick={() => setIsCatalogVisible(false)}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </button>

                {/* Sidebar Izquierda */}
                <aside className={styles.sidebar}>
                    <h3 className={styles.sidebarTitle}>CATEGORÍA</h3>
                    <nav className={styles.categoryNav}>
                        {categories.map(cat => {
                            const isActive = cat === currentCategory;
                            const count = categoryTotals[cat] ?? '…';
                            const dotColor = categoryColors[cat] || '#ffffff';
                            return (
                                <button
                                    key={cat}
                                    className={`${styles.categoryBtn} ${isActive ? styles.activeCategory : ''}`}
                                    onClick={() => handleCategoryClick(cat)}
                                >
                                    <span className={styles.categoryInfo}>
                                        <span className={styles.dot} style={{ backgroundColor: dotColor }} />
                                        <span className={styles.categoryName}>{formatName(cat)}</span>
                                    </span>
                                    <span className={styles.categoryCount}>{count}</span>
                                </button>
                            );
                        })}
                    </nav>
                </aside>

                {/* Contenido Principal Derecha */}
                <main className={styles.mainContent}>
                    {/* Header superior */}
                    <div className={styles.header}>
                        <div className={styles.levelSelector}>
                            <span className={styles.selectorLabel}>Nivel</span>
                            <div className={styles.levelButtons}>
                                {['basic', 'intermediate', 'advanced'].map(lvl => {
                                    const isActive = activeLevel === lvl;
                                    const isAvailable = deckNames.some((name) => getLevelFromDeckName(name) === lvl);
                                    return (
                                        <button
                                            key={lvl}
                                            disabled={!isAvailable}
                                            className={`${styles.levelBtn} ${isActive ? styles.activeLevel : ''}`}
                                            onClick={() => handleLevelChange(lvl)}
                                        >
                                            {lvl}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        <div className={styles.stats}>
                            <span className={styles.statTotal}>{totalCards} cartas</span>
                            <span className={styles.statSeparator}>·</span>
                            <span className={styles.statLearned}>{learnedCards} aprendidas</span>
                        </div>
                    </div>

                    {/* Grilla de grupos */}
                    <div className={styles.groupsGrid}>
                        {groupsList.map(group => {
                            const progressPercent = (group.learned / group.total) * 100;
                            const isComplete = group.learned === group.total;
                            const isNew = group.learned === 0;
                            const categoryColor = categoryColors[currentCategory] || '#38bdf8';

                            return (
                                <div 
                                    key={group.name} 
                                    className={styles.groupCard}
                                    onClick={() => handleGroupClick(group.name)}
                                    style={{ '--card-accent': categoryColor }}
                                >
                                    <div className={styles.groupHeader}>
                                        <h4 className={styles.groupName}>{group.name}</h4>
                                        <span className={styles.groupCountBadge}>{group.total}</span>
                                    </div>

                                    {/* Barra de progreso */}
                                    <div className={styles.progressContainer}>
                                        <div 
                                            className={styles.progressBar} 
                                            style={{ 
                                                width: `${progressPercent}%`,
                                                backgroundColor: categoryColor
                                            }}
                                        />
                                    </div>

                                    {/* Estado inferior */}
                                    <div className={styles.groupStatus}>
                                        {isComplete ? (
                                            <span className={styles.statusCompleted}>✓ completo</span>
                                        ) : isNew ? (
                                            <span className={styles.statusNew}>nuevo</span>
                                        ) : (
                                            <span className={styles.statusProgress}>{group.learned} / {group.total}</span>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </main>
            </div>
        </div>
    );
}

export default CategorySelector;