/**
 * Casos de uso de flashcards (capa de aplicación, lógica pura).
 * Equivalente frontend de `backend/mod_flashcards`.
 */

import { LANDING_DEMO_CATEGORY } from '../../../contracts/landingDemoNamespace';
import { getFlashcardTranslations } from '../config/translations';

export const NESTED_LEVEL_CATEGORIES = [
    'verbs',
    'nouns',
    'adjectives',
    'adverbs',
    'connectors',
    'determinant',
    'phrasal_verbs',
    'preposition',
    'pronouns',
];
const LEVEL_ORDER = { basic: 1, intermediate: 2, advanced: 3 };

const isAppStudyCategory = (name) => name && name !== LANDING_DEMO_CATEGORY;
export const usesNestedLevelDecks = (category) => NESTED_LEVEL_CATEGORIES.includes(category);

const normalizeDefinitions = (defs) =>
    (defs || []).map((def) => ({ ...def, imagePath: def.imagePath ?? null }));

export const normalizeCard = (card, index) => {
    const base = { ...card, ...(card.extra || {}) };

    const normalized = {
        ...base,
        id: index,
        definitions: normalizeDefinitions(base.definitions),
        learned: base.learned || false,
    };

    if (normalized.irregular) {
        const irregular = { ...normalized.irregular };
        ['past', 'participle'].forEach((form) => {
            if (irregular[form]) {
                const defs = irregular[form].definitions || (irregular[form].usage_example ? [{
                    usage_example: irregular[form].usage_example,
                    usage_example_es: irregular[form].usage_example_es,
                    pronunciation_guide_es: irregular[form].pronunciation_guide_es,
                    meaning: irregular[form].meaning,
                }] : []);
                irregular[form] = { ...irregular[form], definitions: normalizeDefinitions(defs) };
            }
        });
        normalized.irregular = irregular;
    }

    return normalized;
};

export const normalizeDeckResponse = (data) => {
    const rawCards = Array.isArray(data) ? data : (data.flashcards || [data]);
    return rawCards.map(normalizeCard);
};

export const getLevelFromDeckName = (deckName) => {
    if (!deckName) return 'basic';
    const lower = deckName.toLowerCase();
    if (lower.includes('advanced')) return 'advanced';
    if (lower.includes('intermediate')) return 'intermediate';
    if (lower.includes('basic')) return 'basic';
    return 'basic';
};

export const getDeckCategoryName = (deckName) => {
    if (!deckName) return '';
    const [maybeLevel, maybeCategory] = deckName.split('/');
    return maybeCategory ? maybeCategory.replace('.json', '') : maybeLevel.replace('.json', '');
};

const DECK_LABELS = {
    access_readiness_and_effort: 'Access, Readiness & Effort',
    action: 'Action',
    addition_and_clarification: 'Addition & Clarification',
    ability_and_achievement: 'Ability & Achievement',
    analysis_research: 'Analysis & Research',
    appearance_and_status: 'Appearance & Status',
    body: 'Body',
    being_state: 'Being State',
    calendar: 'Calendar',
    cause_effect_basics: 'Cause & Effect Basics',
    change_action: 'Change Action',
    change_results: 'Change Results',
    classification: 'Classification',
    clock_time: 'Clock & Time',
    cognition_language: 'Cognition & Language',
    clothes: 'Clothing',
    colors: 'Colors',
    communication: 'Communication',
    communication_social: 'Communication & Social',
    communication_exchange: 'Communication Exchange',
    complex_actions: 'Complex Actions',
    compound_and_partitive: 'Compound & Partitive',
    conflict_resistance: 'Conflict & Resistance',
    continents: 'Continents',
    contrast_and_condition: 'Contrast & Condition',
    contrast_and_reference: 'Contrast & Reference',
    contrast_condition_basics: 'Contrast & Condition Basics',
    core_survival: 'Core Survival',
    countries: 'Countries',
    daily_decisions: 'Daily Decisions',
    daily_life_home: 'Daily Life & Home',
    day_parts: 'Day Parts',
    degree_focus: 'Degree & Focus',
    degree_precision: 'Degree & Precision',
    difficult_situations: 'Difficult Situations',
    direction_and_movement: 'Direction & Movement',
    discourse_logic: 'Discourse & Logic',
    economy: 'Economy',
    emotions_and_personality: 'Emotions & Personality',
    evaluation_comparison_and_comfort: 'Evaluation, Comparison & Comfort',
    evaluation_quality: 'Evaluation & Quality',
    everyday_addition_examples: 'Everyday Addition & Examples',
    examples_and_conclusions: 'Examples & Conclusions',
    experience_and_life_state: 'Experience & Life State',
    family: 'Family',
    feelings: 'Feelings',
    feelings_and_emotions: 'Feelings & Emotions',
    feelings_emotions: 'Feelings & Emotions',
    food_drink: 'Food & Drink',
    formal_addition_clarification: 'Formal Addition & Clarification',
    formal_cause_effect: 'Formal Cause & Effect',
    formal_condition_contrast: 'Formal Condition & Contrast',
    formal_topic_and_extension: 'Formal Topic & Extension',
    frequency_routine: 'Frequency & Routine',
    frequency_time: 'Frequency & Time',
    goals_plans: 'Goals & Plans',
    goals_progress: 'Goals & Progress',
    health: 'Health',
    health_safety_and_emergency: 'Health, Safety & Emergency',
    home_rooms: 'Home & Rooms',
    household_items: 'Household Items',
    demonstrative_pronouns: 'Demonstrative Pronouns',
    indefinite_pronouns: 'Indefinite Pronouns',
    interrogative_adverbs: 'Interrogative Adverbs',
    interrogative_and_relative_pronouns: 'Interrogative & Relative Pronouns',
    interrogative_pronouns: 'Interrogative Pronouns',
    learning_problem_solving: 'Learning & Problem Solving',
    location: 'Location',
    logic_reasoning: 'Logic & Reasoning',
    logic_reference_and_method: 'Logic, Reference & Method',
    manner_action: 'Manner & Action',
    manner_degree_quantity: 'Manner, Degree & Quantity',
    manner_precision: 'Manner & Precision',
    materials_substances: 'Materials & Substances',
    measurement_quantity: 'Measurement & Quantity',
    media: 'Media',
    movement: 'Movement',
    movement_transport: 'Movement & Transport',
    movement_travel: 'Movement & Travel',
    nature: 'Nature',
    numbers: 'Numbers',
    numbers_and_order: 'Numbers & Order',
    object_pronouns: 'Object Pronouns',
    oceans_seas: 'Oceans & Seas',
    jobs: 'Jobs',
    partitives_and_emphasis: 'Partitives & Emphasis',
    personal_items: 'Personal Items',
    personality_and_character: 'Personality & Character',
    physical_state_and_condition: 'Physical State & Condition',
    place_and_time: 'Place & Time',
    place_direction: 'Place & Direction',
    possessive: 'Possessive',
    possessive_adjectives: 'Possessive Adjectives',
    possessive_pronouns_and_emphasis: 'Possessive Pronouns & Emphasis',
    possession_exchange: 'Possession Exchange',
    process_change: 'Process & Change',
    progress_reactions: 'Progress & Reactions',
    quantifier: 'Quantifier',
    quantifier_and_partitive_pronouns: 'Quantifier & Partitive Pronouns',
    quantity_and_measure: 'Quantity & Measure',
    reasoning_meaning: 'Reasoning & Meaning',
    reason_time_and_reference: 'Reason, Time & Reference',
    reference_and_relation: 'Reference & Relation',
    reference_and_selection: 'Reference & Selection',
    reflexive_and_reciprocal_pronouns: 'Reflexive & Reciprocal Pronouns',
    relation_purpose_and_reference: 'Relation, Purpose & Reference',
    relationships_care: 'Relationships & Care',
    safety_emergencies: 'Safety & Emergencies',
    school: 'School',
    science: 'Science',
    search_understanding: 'Search & Understanding',
    seasons: 'Seasons',
    selection_and_possession: 'Selection & Possession',
    sentence_stance: 'Sentence & Stance',
    social_customs: 'Social Customs',
    social_outcomes: 'Social Outcomes',
    social_relations: 'Social Relations',
    social_visits: 'Social Visits',
    space_and_extent: 'Space & Extent',
    space_size_and_crowds: 'Space, Size & Crowds',
    spirit_identity: 'Spirit & Identity',
    sports: 'Sports',
    stance_certainty: 'Stance & Certainty',
    states_conditions: 'States & Conditions',
    structure_components: 'Structure & Components',
    subject_pronouns: 'Subject Pronouns',
    technology: 'Technology',
    thinking: 'Thinking & Senses',
    time_and_sequence: 'Time & Sequence',
    time_change_and_age: 'Time, Change & Age',
    time_frequency: 'Time & Frequency',
    time_sequence: 'Time & Sequence',
    transport: 'Transport',
    value_cost_and_evaluation: 'Value, Cost & Evaluation',
    week_cycle: 'Week Cycle',
    work: 'Work',
    work_progress: 'Work & Progress',
};

export const formatDeckCategoryName = (deckName, language = 'en') => {
    const deckCategory = getDeckCategoryName(deckName);
    const normalizedLabel = DECK_LABELS[deckCategory]
        || deckCategory
            .replace(/[_-]/g, ' ')
            .split(' ')
            .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
    const t = getFlashcardTranslations(language)?.categorySelector;
    return t?.groups?.[normalizedLabel] || normalizedLabel;
};

export const sortDeckNames = (files, _category = null) => {
    const names = files.map((f) => f.replace('.json', ''));
    return names.sort((a, b) => {
        const levelDiff = (LEVEL_ORDER[getLevelFromDeckName(a)] ?? 99) - (LEVEL_ORDER[getLevelFromDeckName(b)] ?? 99);
        if (levelDiff !== 0) return levelDiff;

        const categoryA = getDeckCategoryName(a);
        const categoryB = getDeckCategoryName(b);
        return categoryA.localeCompare(categoryB);
    });
};

export const filterUnlearned = (cards, selectedGroup = null) => {
    let scoped = cards;
    if (selectedGroup) {
        scoped = scoped.filter((c) => c.group_name === selectedGroup);
    }
    return scoped.filter((c) => !c.learned);
};

export const parseCategoriesResponse = (result) => {
    const items = Array.isArray(result)
        ? result
        : (result?.success && Array.isArray(result.categories) ? result.categories : []);

    const names = items
        .map((c) => (typeof c === 'object' ? c?.name : c))
        .filter((name) => isAppStudyCategory(name));
    const totals = {};
    items.forEach((c) => {
        if (c && typeof c === 'object' && c.name && isAppStudyCategory(c.name)) {
            totals[c.name] = c.total;
        }
    });

    return { names, totals };
};

export const resolvePersistedChoice = (storageKey, options, fallback) => {
    const saved = localStorage.getItem(storageKey);
    if (saved && options.includes(saved)) return saved;
    return fallback;
};
