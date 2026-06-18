import React from 'react';
import { UIProvider, useUIContext } from './UIContext';

export { UIProvider, useUIContext } from './UIContext';

export const useAppContext = () => useUIContext();

export const AppProvider = ({ children }) => (
    <UIProvider>
        {children}
    </UIProvider>
);
