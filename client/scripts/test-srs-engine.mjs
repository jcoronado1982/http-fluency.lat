import assert from 'node:assert/strict';
import {
    SRS_ACTIONS,
    buildDailyQueue,
    calculateReview,
    calculateUrgency,
} from '../src/modules/flashcards/domain/SrsEngine.js';
import { assembleSrsDeck } from '../src/modules/flashcards/useCases/srsDeckUseCases.js';

const now = new Date('2026-07-15T12:00:00.000Z');

const firstCorrect = calculateReview({}, SRS_ACTIONS.CORRECT, now);
assert.equal(firstCorrect.box_level, 1);
assert.equal(firstCorrect.interval_days, 3);
assert.equal(firstCorrect.next_review_at, '2026-07-18T12:00:00.000Z');

const failed = calculateReview({
    box_level: 4,
    ease_factor: 2.5,
    interval_days: 20,
    next_review_at: '2026-07-10T12:00:00.000Z',
}, SRS_ACTIONS.FAIL, now);
assert.equal(failed.box_level, 3);
assert.equal(failed.ease_factor, 2.3);
assert.equal(failed.interval_days, 1);

const expelled = calculateReview(failed, SRS_ACTIONS.EXPEL, now);
assert.equal(expelled.box_level, 99);
assert.equal(expelled.next_review_at, null);

assert.throws(() => calculateReview({}, 'unknown', now), /Acción SRS desconocida/);
assert.equal(calculateUrgency({ next_review_at: null }, now), Number.NEGATIVE_INFINITY);
assert.equal(calculateUrgency({
    next_review_at: '2026-07-10T12:00:00.000Z',
    interval_days: 10,
}, now), 0.5);

const queue = buildDailyQueue([
    { card_index: 1, next_review_at: '2026-07-14T12:00:00.000Z', interval_days: 10 },
    { card_index: 2, next_review_at: null, interval_days: null },
    { card_index: 3, next_review_at: '2026-07-05T12:00:00.000Z', interval_days: 5 },
], now, 10);
assert.deepEqual(queue.map((card) => card.card_index), [3, 1, 2]);

const candidates = [
    { category: 'verbs', deck: '1-basic/action', card_index: 1, learned: true },
    { category: 'verbs', deck: '1-basic/action', card_index: 0, learned: true },
];
let loads = 0;
const assembled = await assembleSrsDeck(candidates, async () => {
    loads += 1;
    return [{ word: 'zero' }, { word: 'one' }];
});
assert.equal(loads, 1);
assert.deepEqual(assembled.map((card) => card.word), ['one', 'zero']);
assert.deepEqual(assembled.map((card) => card.id), [1, 0]);

console.log('✅ test-srs-engine: todos los asserts pasaron');
