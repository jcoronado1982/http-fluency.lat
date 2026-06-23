/** Namespace aislado: audio/imagen del landing no comparten rutas con verbs/1-basic ni verbs/2-common. */
export const LANDING_DEMO_CATEGORY = 'landing-demo';
export const LANDING_DEMO_DECK = 'verbs-essentials';
/** Tarjetas visibles en el demo del landing (el JSON puede tener más). */
export const LANDING_DEMO_CARD_LIMIT = 10;

export function buildLandingDemoImagePath(demoIndex, defIndex, form = 'v1') {
    const formSuffix = form && form !== 'v1' ? `_${form}` : '';
    return `/card_images/${LANDING_DEMO_CATEGORY}/${LANDING_DEMO_DECK}/${LANDING_DEMO_DECK}_card_${demoIndex}_def${defIndex}${formSuffix}.avif`;
}
