export function getPricingPlanCards() {
    return {
        monthly: {
            premiumPrice: '4.99',
            premiumPeriod: 'month',
        },
        annual: {
            premiumPrice: '42.51',
            premiumPeriod: 'year',
        },
    };
}

export function getCheckoutPlanData(t) {
    return {
        monthly: {
            price: 4.99,
            priceDisplay: '$4.99 USD',
            period: 'month',
            label: t.monthlyLabel,
            savingsBadge: null,
            billedAs: '$4.99 USD / month',
        },
        annual: {
            price: 42.51,
            priceDisplay: '$42.51 USD',
            period: 'year',
            label: t.annualLabel,
            savingsBadge: '29%',
            billedAs: '$42.51 USD / year',
        },
    };
}

export function getPremiumPerks(t) {
    return [
        { iconKey: 'book', text: t.perks.words },
        { iconKey: 'globe', text: t.perks.languages },
        { iconKey: 'image', text: t.perks.images },
        { iconKey: 'image', text: t.perks.imageAi },
        { iconKey: 'audio', text: t.perks.audio },
        { iconKey: 'star', text: t.perks.support },
    ];
}
