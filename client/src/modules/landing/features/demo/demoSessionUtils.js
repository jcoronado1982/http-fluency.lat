import rawCards from '../../data/demoCards.json';
import {
    LANDING_DEMO_CARD_LIMIT,
    buildLandingDemoImagePath,
} from '../../../../contracts/landingDemoNamespace';

function stripLegacyImagePaths(definitions) {
    return (definitions || []).map((def) => {
        const { imagePath: _removed, ...rest } = def;
        return rest;
    });
}

export function prepareDemoCards(raw) {
    return raw.map((card, idx) => {
        const demoIndex = card.demoIndex ?? idx + 1;
        const definitions = stripLegacyImagePaths(card.definitions);

        let irregular = card.irregular;
        if (irregular?.past?.definitions) {
            irregular = {
                ...irregular,
                past: {
                    ...irregular.past,
                    definitions: stripLegacyImagePaths(irregular.past.definitions),
                },
            };
        }
        if (irregular?.participle?.definitions) {
            irregular = {
                ...irregular,
                participle: {
                    ...irregular.participle,
                    definitions: stripLegacyImagePaths(irregular.participle.definitions),
                },
            };
        }

        return {
            ...card,
            id: demoIndex,
            demoIndex,
            definitions,
            irregular,
            learned: false,
            learned_at: null,
        };
    });
}

export function patchDefinitionImage(cards, cardId, imagePath, defIndex, form) {
    return cards.map((card) => {
        if (card.id !== cardId) return card;

        if (form === 'v2' && card.irregular?.past) {
            const past = { ...card.irregular.past };
            if (Array.isArray(past.definitions) && past.definitions.length > 0) {
                const defs = [...past.definitions];
                if (defs[defIndex]) defs[defIndex] = { ...defs[defIndex], imagePath };
                return { ...card, irregular: { ...card.irregular, past: { ...past, definitions: defs } } };
            }
            if (defIndex === 0) {
                return { ...card, irregular: { ...card.irregular, past: { ...past, imagePath } } };
            }
        }
        if (form === 'v3' && card.irregular?.participle) {
            const part = { ...card.irregular.participle };
            if (Array.isArray(part.definitions) && part.definitions.length > 0) {
                const defs = [...part.definitions];
                if (defs[defIndex]) defs[defIndex] = { ...defs[defIndex], imagePath };
                return { ...card, irregular: { ...card.irregular, participle: { ...part, definitions: defs } } };
            }
            if (defIndex === 0) {
                return { ...card, irregular: { ...card.irregular, participle: { ...part, imagePath } } };
            }
        }

        const defs = [...(card.definitions || [])];
        if (defs[defIndex]) defs[defIndex] = { ...defs[defIndex], imagePath };
        return { ...card, definitions: defs };
    });
}

export const INITIAL_DEMO_CARDS = prepareDemoCards(rawCards.slice(0, LANDING_DEMO_CARD_LIMIT));

export { buildLandingDemoImagePath };
