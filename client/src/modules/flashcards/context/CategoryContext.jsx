import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { flashcardRepository } from '../flashcardRepository';
import { useAuth } from '../../../context/AuthContext';

const CategoryContext = createContext();

const LAST_CATEGORY_KEY = 'flashcards_last_category';

const CATEGORY_ORDER = [
    'pronouns', 'verbs', 'nouns', 'preposition', 'adjectives',
    'adverbs', 'connectors', 'determinant', 'phrasal_verbs',
];

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
    const { isAuthenticated } = useAuth();

    useEffect(() => {
        if (!isAuthenticated) return;
        const load = async () => {
            setIsLoading(true);
            try {
                const result = await flashcardRepository.fetchCategories();
                if (result.success && Array.isArray(result.categories)) {
                    const items = result.categories;
                    const names = items.map(c => (typeof c === 'object' ? c.name : c));
                    const totals = {};
                    items.forEach(c => {
                        if (typeof c === 'object') totals[c.name] = c.total;
                    });
                    const sorted = sortCategories(names);
                    setCategories(sorted);
                    setCategoryTotals(totals);
                    const saved = localStorage.getItem(LAST_CATEGORY_KEY);
                    setCurrentCategory(saved && sorted.includes(saved) ? saved : sorted[0] ?? null);
                }
            } catch {
                // Error silencioso
            } finally {
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
        <CategoryContext.Provider value={{ categories, categoryTotals, currentCategory, changeCategory, isLoading }}>
            {children}
        </CategoryContext.Provider>
    );
};

export const useCategoryContext = () => useContext(CategoryContext);
