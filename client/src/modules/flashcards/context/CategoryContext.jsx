import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { flashcardRepository } from '../flashcardRepository';
import { useAuth } from '../../../context/AuthContext';

const CategoryContext = createContext();

const LAST_CATEGORY_KEY = 'flashcards_last_category';

const CATEGORY_ORDER = [
    'pronouns', 'verbs', 'nouns', 'preposition', 'adjectives',
    'adverbs', 'connectors', 'determinant', 'phrasal_verbs',
];

const FALLBACK_CATEGORIES = CATEGORY_ORDER;

const sortCategories = (cats) =>
    [...cats].sort((a, b) => {
        const iA = CATEGORY_ORDER.indexOf(a);
        const iB = CATEGORY_ORDER.indexOf(b);
        if (iA === -1) return 1;
        if (iB === -1) return -1;
        return iA - iB;
    });

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
                const result = await flashcardRepository.fetchCategories();
                const items = Array.isArray(result)
                    ? result
                    : (result?.success && Array.isArray(result.categories) ? result.categories : []);

                const names = items.map((c) => (typeof c === 'object' ? c?.name : c)).filter(Boolean);
                const totals = {};
                items.forEach((c) => {
                    if (c && typeof c === 'object' && c.name) totals[c.name] = c.total;
                });

                const sorted = sortCategories(names);
                const nextCategories = sorted.length > 0 ? sorted : [...FALLBACK_CATEGORIES];
                setCategories(nextCategories);
                setCategoryTotals(totals);
                const saved = localStorage.getItem(LAST_CATEGORY_KEY);
                setCurrentCategory(saved && nextCategories.includes(saved) ? saved : nextCategories[0] ?? null);
            } catch {
                console.error('No se pudieron cargar las categorías. Usando fallback local.');
                const fallback = [...FALLBACK_CATEGORIES];
                setCategories(fallback);
                setCategoryTotals({});
                const saved = localStorage.getItem(LAST_CATEGORY_KEY);
                setCurrentCategory(saved && fallback.includes(saved) ? saved : fallback[0] ?? null);
            } finally {
                setLoadingStage(null);
                setIsLoading(false);
            }
        };
        load();
    }, [isAuthenticated]);

    const changeCategory = useCallback((cat) => {
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
