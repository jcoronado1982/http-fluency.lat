import React from 'react';
import { LuZap } from 'react-icons/lu';
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
            icon: <LuZap />,
            iconColor: 'premium',
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
