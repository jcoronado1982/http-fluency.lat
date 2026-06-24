import React from 'react';
import { FiZap } from 'react-icons/fi';
import PricingPage from './PricingPage';
import CheckoutPage from './CheckoutPage';

const pricingModule = {
    id: 'pricing',
    enabled: (config) => config.features.payments !== false,
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
    floatingMenuItems: ({ close, navigate, config }) => {
        if (config.features.payments === false) return [];
        return [{
            id: 'pricing-upgrade-float',
            sectionLabel: 'Suscripción',
            icon: <FiZap />,
            iconColor: 'orange',
            name: 'Obtener Premium',
            sub: '2,500 ➔ 5,000 palabras',
            onClick: () => {
                navigate('/pricing');
                close();
            },
        }];
    },
};

export default pricingModule;
