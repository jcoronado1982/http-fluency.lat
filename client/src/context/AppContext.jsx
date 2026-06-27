import React from 'react';
import { UIProvider, useUIContext } from './UIContext';
import { DialogProvider } from './DialogContext';

export { UIProvider, useUIContext } from './UIContext';
export { useDialog } from './DialogContext';

export const useAppContext = () => useUIContext();

export const AppProvider = ({ children }) => (
    <UIProvider>
        <DialogProvider>
            {children}
        </DialogProvider>
    </UIProvider>
);
