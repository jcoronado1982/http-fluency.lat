import React from 'react';
import styles from './CategorySelector.module.css';
import { useUIContext } from '../../context/UIContext';
import { useFlashcardContext } from '../../modules/flashcards/context/FlashcardContext';
import { useCategoryContext } from '../../modules/flashcards/context/CategoryContext';
import { translations } from '../../config/translations';
import { sortGroups } from '../../config/catalogOrder';

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

const formatName = (name, t) => {
    if (!name) return '';
    const clean = name.replace(/^\.\//, '');
    if (t && t.categories && t.categories[clean]) {
        return t.categories[clean];
    }
    return clean.replace(/[_-]/g, ' ').split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
};

function CategorySelector() {
    const { setIsCatalogVisible, language = 'en' } = useUIContext();
    const { categories, currentCategory, changeCategory } = useCategoryContext();
    const t = translations[language].categorySelector;

    const { categoryTotals } = useCategoryContext();

    const {
        deckNames, currentDeckName, changeDeck, masterData, setSelectedGroup, resetGroup
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

    const orderedGroupNames = sortGroups(currentCategory, currentDeckName, Object.keys(groupsMap));

    const groupsList = orderedGroupNames.map(name => {
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

    const handleGroupReset = async (event, groupName) => {
        event.stopPropagation();

        const groupLabel = t.groups?.[groupName] || groupName;
        const shouldReset = window.confirm(
            t.restartGroupConfirm.replace('{group}', groupLabel),
        );

        if (!shouldReset) return;

        const resetOk = await resetGroup(groupName);
        if (resetOk) {
            handleGroupClick(groupName);
        }
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
                    <h3 className={styles.sidebarTitle}>{t.categoryTitle}</h3>
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
                                        <span className={styles.categoryName}>{formatName(cat, t)}</span>
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
                            <span className={styles.selectorLabel}>{t.level}</span>
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
                                            {t.levels ? t.levels[lvl] : lvl.charAt(0).toUpperCase() + lvl.slice(1)}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        <div className={styles.stats}>
                            <span className={styles.statTotal}>{totalCards} {t.cardsInLevel}</span>
                            <span className={styles.statSeparator}>·</span>
                            <span className={styles.statLearned}>{learnedCards} {t.learned}</span>
                        </div>
                    </div>

                    {/* Grilla de grupos */}
                    <div className={styles.groupsGrid}>
                        {groupsList.map(group => {
                            const progressPercent = (group.learned / group.total) * 100;
                            const isComplete = group.learned === group.total;
                            const isNew = group.learned === 0;
                            const categoryColor = categoryColors[currentCategory] || '#38bdf8';
                            const progressColor = isComplete
                                ? '#10b981'
                                : isNew
                                    ? categoryColor
                                    : '#f59e0b';

                            return (
                                <div
                                    key={group.name} 
                                    className={`${styles.groupCard} ${isComplete ? styles.groupCardComplete : ''}`}
                                    onClick={isComplete ? undefined : () => handleGroupClick(group.name)}
                                    style={{ '--card-accent': categoryColor }}
                                    aria-disabled={isComplete}
                                >
                                    <div className={styles.groupHeader}>
                                        <h4 className={styles.groupName}>{t.groups && t.groups[group.name] ? t.groups[group.name] : group.name}</h4>
                                        <div className={styles.groupActions}>
                                            {isComplete ? (
                                                <button
                                                    type="button"
                                                    className={styles.resetGroupBtn}
                                                    onClick={(event) => handleGroupReset(event, group.name)}
                                                >
                                                    {t.restartGroup}
                                                </button>
                                            ) : (
                                                <span className={styles.groupCountBadge}>{group.total}</span>
                                            )}
                                        </div>
                                    </div>

                                    {/* Barra de progreso */}
                                    <div className={styles.progressContainer}>
                                        <div 
                                            className={styles.progressBar} 
                                            style={{ 
                                                width: `${progressPercent}%`,
                                                backgroundColor: progressColor
                                            }}
                                        />
                                    </div>

                                    {/* Estado inferior */}
                                    <div className={styles.groupStatus}>
                                        {isComplete ? (
                                            <span className={styles.statusCompleted}>{t.complete}</span>
                                        ) : isNew ? (
                                            <span className={styles.statusNew}>{t.newStr}</span>
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
