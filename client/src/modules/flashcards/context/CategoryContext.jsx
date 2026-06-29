import React, { useContext, useState, useEffect, useCallback } from 'react';
import { CategoryContext as StudyCategoryContext } from '../../../components/flashcardStudy/context/flashcardStudyContext';
import { flashcardPort } from '../composition';
import { useAuth } from '../../../context/AuthContext';
import { FALLBACK_CATEGORIES, sortCategories } from '../config/catalogOrder';
import { markUserNavigation } from '../navigationIntent';
import { parseCategoriesResponse, resolvePersistedChoice } from '../useCases/deckUseCases';
import { consumeFlashcardPreload } from '../preload';
import { LAST_CATEGORY_KEY } from '../config/sessionKeys';

export const CategoryContext = StudyCategoryContext;

export const CategoryProvider = ({ children, resumeSession = null }) => {
    const [categories, setCategories] = useState([]);
    const [categoryTotals, setCategoryTotals] = useState({});
    const [currentCategory, setCurrentCategory] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [loadingStage, setLoadingStage] = useState('loading_categories');
    const { isAuthenticated, user } = useAuth();

    useEffect(() => {
        if (!isAuthenticated) {
            setIsLoading(false);
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
            setCurrentCategory(resolvePreferredCategory(nextCategories));
        };

        const load = async () => {
            setIsLoading(true);
            setLoadingStage('loading_categories');
            try {
                const preloaded = await consumeFlashcardPreload(user?.email, resumeSession);
                if (preloaded?.categories?.length) {
                    applyCategories(preloaded.categories, preloaded.categoryTotals ?? {});
                    return;
                }

                const result = await flashcardPort.fetchCategories();
                const { names, totals } = parseCategoriesResponse(result);
                const sorted = sortCategories(names);
                const nextCategories = sorted.length > 0 ? sorted : [...FALLBACK_CATEGORIES];
                applyCategories(nextCategories, totals);
            } catch {
                console.error('No se pudieron cargar las categorías. Usando fallback local.');
                const fallback = [...FALLBACK_CATEGORIES];
                applyCategories(fallback, {});
            } finally {
                setLoadingStage(null);
                setIsLoading(false);
            }
        };

        load();
    }, [isAuthenticated, user?.email, resumeSession]);

    const changeCategory = useCallback((cat) => {
        markUserNavigation();
        setCurrentCategory(cat);
        localStorage.setItem(LAST_CATEGORY_KEY, cat);
    }, []);

    return (
        <CategoryContext.Provider value={{ categories, categoryTotals, currentCategory, changeCategory, isLoading, loadingStage }}>
            {children}
        </CategoryContext.Provider>
    );
};

export const useCategoryContext = () => useContext(CategoryContext);
