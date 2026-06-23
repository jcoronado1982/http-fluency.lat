import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { flashcardPort } from '../composition';
import { useAuth } from '../../../context/AuthContext';
import { FALLBACK_CATEGORIES, sortCategories } from '../config/catalogOrder';
import { markUserNavigation } from '../navigationIntent';
import { parseCategoriesResponse, resolvePersistedChoice } from '../useCases/deckUseCases';

const CategoryContext = createContext();

const LAST_CATEGORY_KEY = 'flashcards_last_category';

export const CategoryProvider = ({ children }) => {
    const [categories, setCategories] = useState([]);
    const [categoryTotals, setCategoryTotals] = useState({});
    const [currentCategory, setCurrentCategory] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [loadingStage, setLoadingStage] = useState('loading_categories');
    const { isAuthenticated } = useAuth();

    useEffect(() => {
        if (!isAuthenticated) return;
        const load = async () => {
            setIsLoading(true);
            setLoadingStage('loading_categories');
            try {
                const result = await flashcardPort.fetchCategories();
                const { names, totals } = parseCategoriesResponse(result);
                const sorted = sortCategories(names);
                const nextCategories = sorted.length > 0 ? sorted : [...FALLBACK_CATEGORIES];
                setCategories(nextCategories);
                setCategoryTotals(totals);
                setCurrentCategory(resolvePersistedChoice(LAST_CATEGORY_KEY, nextCategories, nextCategories[0] ?? null));
            } catch {
                console.error('No se pudieron cargar las categorías. Usando fallback local.');
                const fallback = [...FALLBACK_CATEGORIES];
                setCategories(fallback);
                setCategoryTotals({});
                setCurrentCategory(resolvePersistedChoice(LAST_CATEGORY_KEY, fallback, fallback[0] ?? null));
            } finally {
                setLoadingStage(null);
                setIsLoading(false);
            }
        };
        load();
    }, [isAuthenticated]);

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
