import React, { useEffect, useRef, useState } from 'react';
import { FiHelpCircle } from 'react-icons/fi';
import styles from './CategorySelector.module.css';
import { useAuth } from '../../../context/AuthContext';
import { useUIContext } from '../../../context/UIContext';
import { useDialog } from '../../../context/AppContext';
import { useFlashcardUiContext } from '../context/FlashcardUiContext';
import { useFlashcardContext } from '../context/FlashcardContext';
import { useCategoryContext } from '../context/CategoryContext';
import { getFlashcardTranslations } from '../config/translations';
import { sortGroups } from '../config/catalogOrder';
import {
    applyPreferenceOrder,
    getGroupOrderPreference,
    moveOrderedItem,
    saveGroupOrderPreference,
} from '../config/catalogPreferences';
import { categoryToTourSlug } from '../config/onboardingUiAutomation';
import {
    getDeckCategoryName,
    formatDeckCategoryName,
    getLevelFromDeckName,
    usesNestedLevelDecks,
} from '../useCases/deckUseCases';

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

const partitionCompletedItems = (items, completedItems = []) => {
    const completedSet = new Set((Array.isArray(completedItems) ? completedItems : []).filter(Boolean));
    const incomplete = [];
    const completed = [];

    (Array.isArray(items) ? items : []).forEach((item) => {
        if (completedSet.has(item)) {
            completed.push(item);
        } else {
            incomplete.push(item);
        }
    });

    return [...incomplete, ...completed];
};

const escapeRegExp = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const buildHighlightPattern = (items) => items
    .filter(Boolean)
    .map((item) => {
        const text = String(item);
        const escaped = escapeRegExp(text);

        // Highlight standalone words like "in" or "to" without matching inside "going".
        if (/^[A-Za-z]+$/.test(text)) {
            return `\\b${escaped}\\b`;
        }

        return escaped;
    })
    .join('|');

const getCategoryHelpContent = (category, uiTranslations) => {
    const help = uiTranslations?.categoryHelp?.[category] || uiTranslations?.categoryHelp?.nouns;
    if (!help) return null;

    return {
        title: help.title,
        summary: help.summary,
        usage: help.usage,
        example: help.example,
        exampleSentence: help.exampleSentence ?? null,
        exampleNotes: help.exampleNotes ?? null,
        exampleHighlight: help.exampleHighlight ?? null,
        exampleTable: help.exampleTable ?? null,
    };
};

const renderHighlightedExample = (text, highlight) => {
    if (!text) return null;
    if (!highlight) return text;

    const highlightList = Array.isArray(highlight) ? highlight.filter(Boolean) : [highlight];
    if (highlightList.length === 0) return text;

    const pattern = buildHighlightPattern(highlightList);
    const parts = String(text).split(new RegExp(`(${pattern})`, 'gi'));

    return parts.map((part, index) => {
        const matchedHighlight = highlightList.find((item) => part.toLowerCase() === item.toLowerCase());
        if (matchedHighlight) {
            return (
                <strong key={`${part}-${index}`} className={styles.helpPopoverExampleHighlight}>
                    {part}
                </strong>
            );
        }
        return <React.Fragment key={`${part}-${index}`}>{part}</React.Fragment>;
    });
};

const renderExampleTable = (rows, highlight) => {
    if (!Array.isArray(rows) || rows.length === 0) return null;

    return (
        <table className={styles.helpPopoverExampleTable}>
            <tbody>
                {rows.map((row) => (
                    <tr key={row.label}>
                        <th scope="row" className={styles.helpPopoverExampleRowLabel}>
                            {row.label}
                        </th>
                        <td className={styles.helpPopoverExampleRowValues}>
                            <div className={styles.helpPopoverExampleValueList}>
                                {(row.items || []).map((item) => (
                                    <span key={`${row.label}-${item}`} className={styles.helpPopoverExampleValue}>
                                        {renderHighlightedExample(item, highlight)}
                                    </span>
                                ))}
                            </div>
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
    );
};

const renderExampleNotes = (notes, highlight) => {
    if (!Array.isArray(notes) || notes.length === 0) return null;

    return (
        <div className={styles.helpPopoverExampleNotes}>
            {notes.map((note, index) => (
                <p
                    key={`${note}-${index}`}
                    className={`${styles.helpPopoverExampleNote} ${index === notes.length - 1 ? styles.helpPopoverExampleRule : ''}`}
                >
                    {renderHighlightedExample(note, highlight)}
                </p>
            ))}
        </div>
    );
};

const getCategoryQuestionTitle = (category, language, fallbackTitle) => {
    const isSpanish = language === 'es';
    const questionTitles = isSpanish
        ? {
            nouns: '¿Qué es un sustantivo?',
            verbs: '¿Qué es un verbo?',
            adjectives: '¿Qué es un adjetivo?',
            adverbs: '¿Qué es un adverbio?',
            preposition: '¿Qué es una preposición?',
            pronouns: '¿Qué es un pronombre?',
            connectors: '¿Qué es un conector?',
            determinant: '¿Qué es un determinante?',
            phrasal_verbs: '¿Qué es un verbo frasal?',
        }
        : {
            nouns: 'What is a noun?',
            verbs: 'What is a verb?',
            adjectives: 'What is an adjective?',
            adverbs: 'What is an adverb?',
            preposition: 'What is a preposition?',
            pronouns: 'What is a pronoun?',
            connectors: 'What is a connector?',
            determinant: 'What is a determiner?',
            phrasal_verbs: 'What is a phrasal verb?',
        };

    return questionTitles[category] || fallbackTitle;
};

function CategorySelector() {
    const { user, updateCatalogPreferences } = useAuth();
    const { language = 'en', studyLanguage = 'en' } = useUIContext();
    const { confirm } = useDialog();
    const { setIsCatalogVisible } = useFlashcardUiContext();
    const {
        categories,
        currentCategory,
        changeCategory,
        moveCategory,
        isLoading: categoriesLoading,
    } = useCategoryContext();
    const t = getFlashcardTranslations(language).categorySelector;
    const helpQuestionTitle = getCategoryQuestionTitle(currentCategory, language, t.helpPopoverTitle || '');
    const dragStateRef = useRef({ type: null, id: null });
    const helpPopoverRef = useRef(null);
    const helpButtonRef = useRef(null);
    const [draggingCategory, setDraggingCategory] = useState(null);
    const [draggingGroup, setDraggingGroup] = useState(null);
    const [, setGroupOrderRevision] = useState(0);
    const [isHelpOpen, setIsHelpOpen] = useState(false);

    const { categoryTotals } = useCategoryContext();

    const {
        deckNames, deckSummaries, currentDeckName, changeDeck, masterData, setSelectedGroup, resetGroup
    } = useFlashcardContext();

    const totalCards = masterData.length;
    const learnedCards = masterData.filter(c => c.learned).length;
    const studyLocale = studyLanguage === 'es' ? 'es' : 'en';
    const interfaceHelpContent = getCategoryHelpContent(
        currentCategory,
        getFlashcardTranslations(language).categorySelector,
    );
    const studyHelpContent = getCategoryHelpContent(
        currentCategory,
        getFlashcardTranslations(studyLocale).categorySelector,
    );
    const mergedExampleTable = interfaceHelpContent?.exampleTable?.map((row, index) => ({
        ...row,
        items: studyHelpContent?.exampleTable?.[index]?.items ?? row.items,
    })) ?? null;
    const helpContent = interfaceHelpContent
        ? {
            ...interfaceHelpContent,
            example: studyHelpContent?.example ?? interfaceHelpContent.example,
            exampleSentence: studyHelpContent?.exampleSentence ?? interfaceHelpContent.exampleSentence,
            exampleNotes: studyHelpContent?.exampleNotes ?? interfaceHelpContent.exampleNotes,
            exampleHighlight: studyHelpContent?.exampleHighlight ?? interfaceHelpContent.exampleHighlight,
            exampleTable: mergedExampleTable,
        }
        : null;

    // Obtener los grupos únicos de la data cargada actualmente
    const groupsMap = {};
    masterData.forEach(card => {
        const groupName = card.group_name || 'General';
        if (!groupsMap[groupName]) {
            groupsMap[groupName] = [];
        }
        groupsMap[groupName].push(card);
    });

    const groupNames = Object.keys(groupsMap);
    const completedGroupNames = groupNames.filter((groupName) => {
        const cards = groupsMap[groupName] || [];
        return cards.length > 0 && cards.every((card) => card.learned);
    });

    const storedGroupOrder = getGroupOrderPreference(
        user?.email,
        currentCategory,
        currentDeckName,
        groupNames,
        user?.catalog_preferences,
    );
    const orderedGroupNames = sortGroups(
        currentCategory,
        currentDeckName,
        groupNames,
        storedGroupOrder,
        completedGroupNames,
    );

    const groupsList = orderedGroupNames
        .map(name => {
            const cards = groupsMap[name];
            const total = cards.length;
            const learned = cards.filter(c => c.learned).length;
            return { name, total, learned };
        });
    const visibleGroups = groupsList;
    const isNestedCatalog = usesNestedLevelDecks(currentCategory);
    const activeLevel = getLevelFromDeckName(currentDeckName);
    const levelPreferenceKey = `__level__${activeLevel || 'basic'}`;
    const nestedDeckNames = isNestedCatalog
        ? deckNames.filter((name) => getLevelFromDeckName(name) === activeLevel)
        : [];
    const completedNestedDeckNames = nestedDeckNames.filter((deckName) => {
        const summary = deckSummaries[deckName];
        return summary?.total > 0 && summary.learned === summary.total;
    });
    const storedNestedDeckOrder = getGroupOrderPreference(
        user?.email,
        currentCategory,
        levelPreferenceKey,
        nestedDeckNames,
        user?.catalog_preferences,
    );
    const visibleNestedDecks = partitionCompletedItems(
        applyPreferenceOrder(nestedDeckNames, storedNestedDeckOrder),
        completedNestedDeckNames,
    );

    const handleLevelChange = (level) => {
        const targetDeck = isNestedCatalog
            ? (
                deckNames.find((name) =>
                    getLevelFromDeckName(name) === level
                    && getDeckCategoryName(name) === getDeckCategoryName(currentDeckName),
                ) ?? deckNames.find((name) => getLevelFromDeckName(name) === level)
            )
            : deckNames.find((name) => getLevelFromDeckName(name) === level);
        if (targetDeck) {
            changeDeck(targetDeck);
        }
    };

    const handleCategoryClick = (category) => {
        changeCategory(category);
    };

    const handleGroupClick = (groupName) => {
        setSelectedGroup(groupName === 'General' ? null : groupName);
    };

    const handleVerbDeckClick = (deckName) => {
        changeDeck(deckName);
        setIsCatalogVisible(false);
    };

    const reorderCategories = (targetCategory) => {
        const sourceCategory = dragStateRef.current.id;
        if (!sourceCategory || sourceCategory === targetCategory) return;

        const fromIndex = categories.indexOf(sourceCategory);
        const toIndex = categories.indexOf(targetCategory);
        if (fromIndex === -1 || toIndex === -1) return;

        moveCategory(fromIndex, toIndex);
    };

    const reorderGroups = (targetGroupName) => {
        const sourceGroupName = dragStateRef.current.id;
        if (!sourceGroupName || sourceGroupName === targetGroupName) return;

        const incompleteGroupNames = groupsList
            .filter((group) => group.learned !== group.total)
            .map((group) => group.name);
        const fromIndex = incompleteGroupNames.indexOf(sourceGroupName);
        const toIndex = incompleteGroupNames.indexOf(targetGroupName);

        if (fromIndex === -1 || toIndex === -1) return;

        const reorderedIncomplete = moveOrderedItem(incompleteGroupNames, fromIndex, toIndex);
        const completeGroupNames = groupsList
            .filter((group) => group.learned === group.total)
            .map((group) => group.name);
        const nextOrder = [...reorderedIncomplete, ...completeGroupNames];
        const nextPreferences = saveGroupOrderPreference(
            user?.email,
            currentCategory,
            currentDeckName,
            nextOrder,
            user?.catalog_preferences,
        );
        void updateCatalogPreferences(nextPreferences);
        setGroupOrderRevision((value) => value + 1);
    };

    const reorderNestedDecks = (targetDeckName) => {
        const sourceDeckName = dragStateRef.current.id;
        if (!sourceDeckName || sourceDeckName === targetDeckName) return;

        const incompleteDeckNames = visibleNestedDecks.filter(
            (deckName) => !completedNestedDeckNames.includes(deckName),
        );
        const fromIndex = incompleteDeckNames.indexOf(sourceDeckName);
        const toIndex = incompleteDeckNames.indexOf(targetDeckName);

        if (fromIndex === -1 || toIndex === -1) return;

        const reorderedIncomplete = moveOrderedItem(incompleteDeckNames, fromIndex, toIndex);
        const nextOrder = [...reorderedIncomplete, ...completedNestedDeckNames];
        const nextPreferences = saveGroupOrderPreference(
            user?.email,
            currentCategory,
            levelPreferenceKey,
            nextOrder,
            user?.catalog_preferences,
        );
        void updateCatalogPreferences(nextPreferences);
        setGroupOrderRevision((value) => value + 1);
    };

    const handleGroupReset = async (event, groupName) => {
        event.stopPropagation();

        const groupLabel = t.groups?.[groupName] || groupName;
        const shouldReset = await confirm({
            title: t.restartGroupConfirm.replace('{group}', groupLabel),
            tone: 'danger',
            confirmLabel: t.restartGroup,
        });

        if (!shouldReset) return;

        const resetOk = await resetGroup(groupName);
        if (resetOk) {
            handleGroupClick(groupName);
        }
    };

    useEffect(() => {
        const previousBodyOverflow = document.body.style.overflow;
        const previousHtmlOverflow = document.documentElement.style.overflow;

        document.body.style.overflow = 'hidden';
        document.documentElement.style.overflow = 'hidden';

        return () => {
            document.body.style.overflow = previousBodyOverflow;
            document.documentElement.style.overflow = previousHtmlOverflow;
        };
    }, []);

    useEffect(() => {
        if (!isHelpOpen) return undefined;

        const handlePointerDown = (event) => {
            const helpNode = helpPopoverRef.current;
            const buttonNode = helpButtonRef.current;
            if (helpNode?.contains(event.target) || buttonNode?.contains(event.target)) return;
            setIsHelpOpen(false);
        };

        const handleKeyDown = (event) => {
            if (event.key === 'Escape') {
                setIsHelpOpen(false);
            }
        };

        document.addEventListener('pointerdown', handlePointerDown);
        document.addEventListener('keydown', handleKeyDown);

        return () => {
            document.removeEventListener('pointerdown', handlePointerDown);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [isHelpOpen]);

    return (
        <div className={styles.categorySelectorOverlay}>
            <div className={styles.dashboardContainer} data-tour="catalogo-modal">
                {/* Botón de cerrar */}
                <button className={styles.closeBtn} onClick={() => setIsCatalogVisible(false)}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </button>

                {/* Sidebar Izquierda */}
                <aside className={styles.sidebar} data-tour="panel-categorias">
                    <h3 className={styles.sidebarTitle}>{t.categoryTitle}</h3>
                    <nav className={styles.categoryNav}>
                        {categoriesLoading && categories.length === 0 && (
                            <p className={styles.sidebarLoading}>{t.loadingCategories || '…'}</p>
                        )}
                        {categories.map(cat => {
                            const isActive = cat === currentCategory;
                            const count = categoryTotals[cat] ?? '…';
                            const dotColor = categoryColors[cat] || '#ffffff';
                            return (
                                <button
                                    key={cat}
                                    className={`${styles.categoryBtn} ${isActive ? styles.activeCategory : ''} ${draggingCategory === cat ? styles.isDragging : ''}`}
                                    onClick={() => handleCategoryClick(cat)}
                                    draggable
                                    onDragStart={(event) => {
                                        event.dataTransfer.effectAllowed = 'move';
                                        event.dataTransfer.setData('text/plain', cat);
                                        dragStateRef.current = { type: 'category', id: cat };
                                        setDraggingCategory(cat);
                                    }}
                                    onDragOver={(event) => {
                                        if (dragStateRef.current.type !== 'category') return;
                                        event.preventDefault();
                                    }}
                                    onDrop={(event) => {
                                        event.preventDefault();
                                        if (dragStateRef.current.type !== 'category') return;
                                        reorderCategories(cat);
                                    }}
                                    onDragEnd={() => {
                                        dragStateRef.current = { type: null, id: null };
                                        setDraggingCategory(null);
                                    }}
                                    data-tour="categoria-item"
                                    data-categoria={categoryToTourSlug(cat)}
                                    aria-current={isActive ? 'true' : undefined}
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
                        <div className={styles.levelSelector} data-tour="catalogo-nivel">
                            <div className={styles.selectorLabelRow}>
                                <span className={styles.selectorLabel}>{t.level}</span>
                            </div>
                            <div className={styles.levelControlsRow}>
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
                                <button
                                    type="button"
                                    ref={helpButtonRef}
                                    className={styles.helpIconBtn}
                                    onClick={() => setIsHelpOpen((value) => !value)}
                                    aria-label={t.helpButtonLabel || 'Category help'}
                                    aria-expanded={isHelpOpen}
                                    aria-controls="category-help-popover"
                                >
                                    <FiHelpCircle />
                                </button>
                            </div>
                            {isHelpOpen && helpContent && (
                                <div
                                    id="category-help-popover"
                                    ref={helpPopoverRef}
                                    className={styles.helpPopover}
                                    role="dialog"
                                    aria-label={helpQuestionTitle || helpContent.title}
                                >
                                    <div className={styles.helpPopoverHeader}>
                                        <span className={styles.helpPopoverKicker}>{helpQuestionTitle}</span>
                                        <button
                                            type="button"
                                            className={styles.helpPopoverCloseBtn}
                                            onClick={() => setIsHelpOpen(false)}
                                            aria-label={language === 'es' ? 'Cerrar ayuda' : 'Close help'}
                                        >
                                            ×
                                        </button>
                                    </div>
                                    <p className={styles.helpPopoverText}>{helpContent.summary}</p>
                                    <div className={styles.helpPopoverBlock}>
                                        <span className={styles.helpPopoverLabel}>{t.helpPopoverUsageLabel}</span>
                                        <p className={styles.helpPopoverText}>{helpContent.usage}</p>
                                    </div>
                                    <div className={styles.helpPopoverExample}>
                                        <span className={styles.helpPopoverLabel}>{t.helpPopoverExampleLabel}</span>
                                        {helpContent.exampleTable ? (
                                            <>
                                                {renderExampleTable(helpContent.exampleTable, helpContent.exampleHighlight)}
                                                {helpContent.exampleSentence ? (
                                                    <p className={styles.helpPopoverExampleSentence}>
                                                        {helpContent.exampleSentence}
                                                    </p>
                                                ) : null}
                                                {renderExampleNotes(helpContent.exampleNotes, helpContent.exampleHighlight)}
                                            </>
                                        ) : helpContent.exampleNotes ? (
                                            renderExampleNotes(helpContent.exampleNotes, helpContent.exampleHighlight)
                                        ) : (
                                            <p className={styles.helpPopoverExampleText}>
                                                {renderHighlightedExample(helpContent.example, helpContent.exampleHighlight)}
                                            </p>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className={styles.stats}>
                            <span className={styles.statTotal}>{totalCards} {t.cardsInLevel}</span>
                            <span className={styles.statSeparator}>·</span>
                            <span className={styles.statLearned}>{learnedCards} {t.learned}</span>
                        </div>
                    </div>

                    {/* Grilla de grupos */}
                    <div className={styles.groupsGrid} data-tour="catalogo-grid">
                        {isNestedCatalog ? visibleNestedDecks.map((deckName) => {
                            const summary = deckSummaries[deckName];
                            const total = summary?.total ?? 0;
                            const learned = summary?.learned ?? 0;
                            const progressPercent = total > 0 ? (learned / total) * 100 : 0;
                            const isComplete = total > 0 && learned === total;
                            const isNew = learned === 0;
                            const isActiveDeck = deckName === currentDeckName;
                            const categoryColor = categoryColors[currentCategory] || '#38bdf8';
                            const progressColor = isComplete
                                ? '#10b981'
                                    : isNew
                                        ? categoryColor
                                    : '#f59e0b';

                            return (
                                <div
                                    key={deckName}
                                    className={`${styles.groupCard} ${isComplete ? styles.groupCardComplete : ''} ${isActiveDeck ? styles.activeCategory : ''} ${draggingGroup === deckName ? styles.isDragging : ''}`}
                                    onClick={() => handleVerbDeckClick(deckName)}
                                    style={{ '--card-accent': categoryColor }}
                                    data-tour="boton-abrir-categoria"
                                    draggable={!isComplete}
                                    onDragStart={(event) => {
                                        if (isComplete) return;
                                        event.dataTransfer.effectAllowed = 'move';
                                        event.dataTransfer.setData('text/plain', deckName);
                                        dragStateRef.current = { type: 'nested-deck', id: deckName };
                                        setDraggingGroup(deckName);
                                    }}
                                    onDragOver={(event) => {
                                        if (isComplete || dragStateRef.current.type !== 'nested-deck') return;
                                        event.preventDefault();
                                    }}
                                    onDrop={(event) => {
                                        event.preventDefault();
                                        if (isComplete || dragStateRef.current.type !== 'nested-deck') return;
                                        reorderNestedDecks(deckName);
                                    }}
                                    onDragEnd={() => {
                                        dragStateRef.current = { type: null, id: null };
                                        setDraggingGroup(null);
                                    }}
                                >
                                    <div className={styles.groupHeader}>
                                        <h4 className={styles.groupName}>{formatDeckCategoryName(deckName)}</h4>
                                        <div className={styles.groupActions}>
                                            <span className={styles.groupCountBadge}>{summary ? total : '…'}</span>
                                        </div>
                                    </div>

                                    <div className={styles.progressContainer}>
                                        <div
                                            className={styles.progressBar}
                                            style={{
                                                width: `${progressPercent}%`,
                                                backgroundColor: progressColor,
                                            }}
                                        />
                                    </div>

                                    <div className={styles.groupStatus}>
                                        {summary ? `${learned} / ${total}` : (t.loadingCategories || '…')}
                                    </div>
                                </div>
                            );
                        }) : visibleGroups.map((group) => {
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
                                    className={`${styles.groupCard} ${isComplete ? styles.groupCardComplete : ''} ${draggingGroup === group.name ? styles.isDragging : ''}`}
                                    onClick={isComplete ? undefined : () => handleGroupClick(group.name)}
                                    style={{ '--card-accent': categoryColor }}
                                    aria-disabled={isComplete}
                                    draggable={!isComplete}
                                    onDragStart={(event) => {
                                        if (isComplete) return;
                                        event.dataTransfer.effectAllowed = 'move';
                                        event.dataTransfer.setData('text/plain', group.name);
                                        dragStateRef.current = { type: 'group', id: group.name };
                                        setDraggingGroup(group.name);
                                    }}
                                    onDragOver={(event) => {
                                        if (isComplete || dragStateRef.current.type !== 'group') return;
                                        event.preventDefault();
                                    }}
                                    onDrop={(event) => {
                                        event.preventDefault();
                                        if (isComplete || dragStateRef.current.type !== 'group') return;
                                        reorderGroups(group.name);
                                    }}
                                    onDragEnd={() => {
                                        dragStateRef.current = { type: null, id: null };
                                        setDraggingGroup(null);
                                    }}
                                    data-tour={!isComplete ? 'boton-abrir-categoria' : undefined}
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
