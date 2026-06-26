import React from 'react';
import { FiZap } from 'react-icons/fi';
import PricingPage from './PricingPage';
import CheckoutPage from './CheckoutPage';
import { getPricingTranslations } from './translations';

const pricingModule = {
    id: 'pricing',
    enabled: (config) => config.features.pricing !== false,
    routes: () => [
        {
            path: '/pricing',
            element: <PricingPage />,
            layout: 'bare',
            public: true,
        },
        {
            path: '/checkout',
            element: <CheckoutPage />,
            layout: 'bare',
            public: true,
        },
    ],
    floatingMenuItems: ({ close, navigate, config, language }) => {
        if (config.features.pricing === false) return [];
        const t = getPricingTranslations(language);
        return [{
            id: 'pricing-upgrade-float',
            sectionLabel: t.floatingMenu.sectionLabel,
            icon: <FiZap />,
            iconColor: 'orange',
            name: t.floatingMenu.name,
            sub: t.floatingMenu.sub,
            onClick: () => {
                navigate('/pricing');
                close();
            },
        }];
    },
};

export default pricingModule;
