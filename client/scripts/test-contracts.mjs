import assert from 'node:assert/strict';
import {
  LANDING_DEMO_CARD_LIMIT,
  LANDING_DEMO_CATEGORY,
  LANDING_DEMO_DECK,
  buildLandingDemoImagePath,
  isLandingDemoCategory,
} from '../src/contracts/landingDemoNamespace.js';
import {
  LANDING_DEMO_MEDIA,
  STUDY_MEDIA_VARIANT_APP,
  STUDY_MEDIA_VARIANT_LANDING_DEMO,
  isLandingDemoMediaVariant,
  resolveStudyMediaNamespace,
} from '../src/contracts/studyMediaVariants.js';

// Estos valores son CONTRATO entre módulos y con el backend (mod_flashcards
// enruta proveedores TTS/imagen por category): si cambian, debe ser a propósito.
assert.equal(LANDING_DEMO_CATEGORY, 'landing-demo');
assert.equal(LANDING_DEMO_DECK, 'verbs-essentials');
assert.equal(typeof LANDING_DEMO_CARD_LIMIT, 'number');
assert.ok(LANDING_DEMO_CARD_LIMIT > 0);

assert.equal(isLandingDemoCategory('landing-demo'), true);
assert.equal(isLandingDemoCategory('verbs'), false);
assert.equal(isLandingDemoCategory(undefined), false);

// Ruta de imagen del demo: formato exacto que el backend escribe en disco
assert.equal(
  buildLandingDemoImagePath(0, 0),
  '/card_images/landing-demo/verbs-essentials/verbs-essentials_card_0_def0.avif',
);
// v1 no lleva sufijo; otras formas sí
assert.equal(buildLandingDemoImagePath(2, 1, 'v1'), buildLandingDemoImagePath(2, 1));
assert.equal(
  buildLandingDemoImagePath(2, 1, 'v2'),
  '/card_images/landing-demo/verbs-essentials/verbs-essentials_card_2_def1_v2.avif',
);

// Variantes de media del kit de estudio
assert.equal(STUDY_MEDIA_VARIANT_APP, 'app');
assert.equal(STUDY_MEDIA_VARIANT_LANDING_DEMO, 'landing-demo');
assert.equal(isLandingDemoMediaVariant(STUDY_MEDIA_VARIANT_LANDING_DEMO), true);
assert.equal(isLandingDemoMediaVariant(STUDY_MEDIA_VARIANT_APP), false);

// LANDING_DEMO_MEDIA está congelado y coherente con el namespace
assert.ok(Object.isFrozen(LANDING_DEMO_MEDIA));
assert.equal(LANDING_DEMO_MEDIA.category, LANDING_DEMO_CATEGORY);
assert.equal(LANDING_DEMO_MEDIA.deck, LANDING_DEMO_DECK);

// resolveStudyMediaNamespace: el demo fuerza su namespace; la app usa el contexto
assert.deepEqual(
  resolveStudyMediaNamespace(STUDY_MEDIA_VARIANT_LANDING_DEMO, 'verbs', '1-basic'),
  { category: LANDING_DEMO_CATEGORY, deck: LANDING_DEMO_DECK },
);
assert.deepEqual(
  resolveStudyMediaNamespace(STUDY_MEDIA_VARIANT_APP, 'verbs', '1-basic/action'),
  { category: 'verbs', deck: '1-basic/action' },
);

console.log('✅ test-contracts: todos los asserts pasaron');
