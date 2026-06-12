// AppContext — shim de compatibilidad.
// Los contextos reales están en CategoryContext y UIContext.
// Componentes nuevos deben importar directamente desde esos módulos.

import React from 'react';
import { CategoryProvider, useCategoryContext } from './CategoryContext';
import { UIProvider, useUIContext } from './UIContext';

export { CategoryProvider, useCategoryContext } from './CategoryContext';
export { UIProvider, useUIContext } from './UIContext';

// Hook fusionado — compatibilidad con consumidores existentes
export const useAppContext = () => ({
    ...useCategoryContext(),
    ...useUIContext(),
});

// Provider compuesto
export const AppProvider = ({ children }) => (
    <CategoryProvider>
        <UIProvider>
            {children}
        </UIProvider>
    </CategoryProvider>
);
