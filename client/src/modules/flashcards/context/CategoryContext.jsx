import React, { useContext, useState, useEffect, useCallback, useRef } from 'react';
import { CategoryContext as StudyCategoryContext } from '../../../components/flashcardStudy/context/flashcardStudyContext';
import { flashcardPort } from '../composition';
import { useAuth } from '../../../context/AuthContext';
import { useUIContext } from '../../../context/UIContext';
import { FALLBACK_CATEGORIES, sortCategories } from '../config/catalogOrder';
import {
    getCategoryOrderPreference,
    hasLegacyAlphabeticalCategoryOrder,
    moveOrderedItem,
    saveCategoryOrderPreference,
    isCatalogPreferencesCurrent,
} from '../config/catalogPreferences';
import { markUserNavigation } from '../navigationIntent';
import {
    getCourseDirectionFromStudyLanguage,
    parseCategoriesResponse,
    resolvePersistedChoice,
} from '../useCases/deckUseCases';
import { consumeCategoryPreload } from '../preload';
import { LAST_CATEGORY_KEY } from '../config/sessionKeys';

export const CategoryContext = StudyCategoryContext;
export const CategoryProvider = ({ children, resumeSession = null }) => {
    const [categories, setCategories] = useState([]);
    const [categoryTotals, setCategoryTotals] = useState({});
    const [areCategoryTotalsLoading, setAreCategoryTotalsLoading] = useState(false);
    const [currentCategory, setCurrentCategory] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [loadingStage, setLoadingStage] = useState('loading_categories');
    const clearedInvalidPreferencesRef = useRef(false);
    const { isAuthenticated, user, updateCatalogPreferences } = useAuth();
    const { studyLanguage = 'en' } = useUIContext();
    const courseDirection = getCourseDirectionFromStudyLanguage(studyLanguage);

    useEffect(() => {
        if (!isAuthenticated) {
            setIsLoading(false);
            setAreCategoryTotalsLoading(false);
            setLoadingStage(null);
            return;
        }

        const resolvePreferredCategory = (nextCategories) => {
            if (resumeSession?.category && nextCategories.includes(resumeSession.category)) {
                return resumeSession.category;
            }
            return resolvePersistedChoice(LAST_CATEGORY_KEY, nextCategories, nextCategories[0] ?? null);
        };

        const applyCategories = (nextCategories, totals) => {
            setCategories(nextCategories);
            setCategoryTotals(totals);
            setAreCategoryTotalsLoading(
                nextCategories.some((category) => totals?.[category] == null),
            );
            setCurrentCategory(resolvePreferredCategory(nextCategories));
        };

        const getValidCatalogPreferences = (availableCategories) => {
            const preferences = user?.catalog_preferences;
            const isCurrent = isCatalogPreferencesCurrent(preferences);
            const isLegacyAlphabetical = hasLegacyAlphabeticalCategoryOrder(preferences, availableCategories);

            if (isCurrent && !isLegacyAlphabetical) {
                return user?.catalog_preferences;
            }

            if (preferences && !clearedInvalidPreferencesRef.current) {
                clearedInvalidPreferencesRef.current = true;
                void updateCatalogPreferences(null);
            }
            return null;
        };

        const load = async () => {
            setIsLoading(true);
            setLoadingStage('loading_categories');
            try {
                const preloaded = await consumeCategoryPreload(
                    user?.email,
                    resumeSession,
                    studyLanguage,
                );
                if (
                    preloaded?.courseDirection === courseDirection
                    && preloaded?.categories?.length
                ) {
                    const preferences = getValidCatalogPreferences(preloaded.categories);
                    const ordered = sortCategories(
                        preloaded.categories,
                        getCategoryOrderPreference(
                            user?.email,
                            preloaded.categories,
                            preferences,
                        ),
                    );
                    applyCategories(ordered, preloaded.categoryTotals ?? {});
                    return;
                }

                const result = await flashcardPort.fetchCategories(courseDirection);
                const { names, totals } = parseCategoriesResponse(result);
                const preferences = getValidCatalogPreferences(names);
                const sorted = sortCategories(
                    names,
                    getCategoryOrderPreference(user?.email, names, preferences),
                );
                const nextCategories = sorted.length > 0 ? sorted : [...FALLBACK_CATEGORIES];
                applyCategories(nextCategories, totals);
            } catch {
                console.error('No se pudieron cargar las categorías. Usando fallback local.');
                const preferences = getValidCatalogPreferences(FALLBACK_CATEGORIES);
                const fallback = sortCategories(
                    [...FALLBACK_CATEGORIES],
                    getCategoryOrderPreference(user?.email, FALLBACK_CATEGORIES, preferences),
                );
                applyCategories(fallback, {});
                setAreCategoryTotalsLoading(false);
            } finally {
                setLoadingStage(null);
                setIsLoading(false);
            }
        };

        load();
    }, [courseDirection, isAuthenticated, resumeSession, studyLanguage, updateCatalogPreferences, user?.catalog_preferences, user?.email]);

    useEffect(() => {
        clearedInvalidPreferencesRef.current = false;
    }, [user?.email]);

    const changeCategory = useCallback((cat) => {
        markUserNavigation();
        setCurrentCategory(cat);
        localStorage.setItem(LAST_CATEGORY_KEY, cat);
    }, []);

    const moveCategory = useCallback((fromIndex, toIndex) => {
        setCategories((previous) => {
            const next = moveOrderedItem(previous, fromIndex, toIndex);
            const nextPreferences = saveCategoryOrderPreference(
                user?.email,
                next,
                user?.catalog_preferences,
            );
            void updateCatalogPreferences(nextPreferences);
            return next;
        });
    }, [updateCatalogPreferences, user?.catalog_preferences, user?.email]);

    return (
        <CategoryContext.Provider value={{
            categories,
            categoryTotals,
            areCategoryTotalsLoading,
            currentCategory,
            changeCategory,
            moveCategory,
            isLoading,
            loadingStage,
        }}
        >
            {children}
        </CategoryContext.Provider>
    );
};

export const useCategoryContext = () => useContext(CategoryContext);
