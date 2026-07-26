const { test } = require('node:test');
const assert = require('node:assert');
const { buildPerformancePoints, computeGainPct, nextDealCursor } = require('../lib/performance');

test('computeGainPct: guadagno, perdita, baseline 0, input invalidi', () => {
    assert.ok(Math.abs(computeGainPct(1000, 1100) - 10) < 1e-9);
    assert.ok(Math.abs(computeGainPct(1000, 900) + 10) < 1e-9);
    assert.strictEqual(computeGainPct(0, 500), null);      // prima del primo deposito
    assert.strictEqual(computeGainPct(-5, 500), null);
    assert.strictEqual(computeGainPct(1000, NaN), null);
});

test('buildPerformancePoints: baseline + deal ordinati + punto attuale', () => {
    const points = buildPerformancePoints({
        connectedAtMs: 1000, baselineBalance: 500,
        deals: [{ t: 3000, balance: 520 }, { t: 2000, balance: 480 }],
        nowMs: 4000, currentBalance: 530,
    });
    assert.deepStrictEqual(points, [
        { t: 1000, balance: 500 },
        { t: 2000, balance: 480 },
        { t: 3000, balance: 520 },
        { t: 4000, balance: 530 },
    ]);
});

test('buildPerformancePoints: scarta deal fuori range o invalidi', () => {
    const points = buildPerformancePoints({
        connectedAtMs: 1000, baselineBalance: 500,
        deals: [{ t: 500, balance: 999 }, { t: NaN, balance: 1 }, { t: 2000, balance: NaN }],
        nowMs: 4000, currentBalance: 530,
    });
    assert.deepStrictEqual(points, [
        { t: 1000, balance: 500 },
        { t: 4000, balance: 530 },
    ]);
});

test('nextDealCursor: fine blocco, paginazione, guardie anti-loop', () => {
    // blocco esaurito -> si passa al blocco successivo
    assert.strictEqual(nextDealCursor({ hasMore: false, lastDealTimestamp: 1500 }, 1000, 2000), 2000);
    // hasMore con progresso -> si riparte dall'ultimo deal + 1
    assert.strictEqual(nextDealCursor({ hasMore: true, lastDealTimestamp: 1500 }, 1000, 2000), 1501);
    // hasMore senza progresso (timestamp <= cursore) -> avanza comunque
    assert.strictEqual(nextDealCursor({ hasMore: true, lastDealTimestamp: 999 }, 1000, 2000), 2000);
    // hasMore ma ultimo deal oltre il blocco -> si ferma a fine blocco
    assert.strictEqual(nextDealCursor({ hasMore: true, lastDealTimestamp: 2500 }, 1000, 2000), 2000);
});
