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

const { rangeWindows, buildRangeViews, historyWindowStart } = require('../lib/performance');

const DAY = 24 * 60 * 60 * 1000;

test('rangeWindows: sei finestre nell ordine atteso con inizi corretti', () => {
    const now = 1_000_000_000_000;
    const conn = now - 3 * DAY;
    const w = rangeWindows(now, conn);
    assert.deepStrictEqual(w.map(x => x.key), ['1w', '1m', '3m', '6m', '1y', 'conn']);
    assert.strictEqual(w[0].fromMs, now - 7 * DAY);
    assert.strictEqual(w[1].fromMs, now - 30 * DAY);
    assert.strictEqual(w[2].fromMs, now - 90 * DAY);
    assert.strictEqual(w[3].fromMs, now - 180 * DAY);
    assert.strictEqual(w[4].fromMs, now - 365 * DAY);
    assert.strictEqual(w[4].label, '1 anno');
    assert.strictEqual(w[5].fromMs, conn);
    assert.strictEqual(w[5].label, 'Dalla connessione');
    assert.strictEqual(w[0].label, '1 settimana');
});

// La finestra più ampia deve coprire la vista più lunga: se coprisse solo sei
// mesi, la vista a 1 anno mostrerebbe dati troncati senza dirlo.
test('historyWindowStart: parte da un anno indietro, o dalla connessione se più vecchia', () => {
    const now = 1_000_000_000_000;
    assert.strictEqual(historyWindowStart(now, now - 10 * DAY), now - 365 * DAY);
    const oldConn = now - 500 * DAY;
    assert.strictEqual(historyWindowStart(now, oldConn), oldConn);
});

test('buildRangeViews: ancora = ultimo punto prima della finestra', () => {
    const views = buildRangeViews({
        series: [{ t: 100, balance: 500 }, { t: 200, balance: 600 }, { t: 300, balance: 700 }],
        windows: [{ key: '1w', label: '1 settimana', fromMs: 250 }],
        baselineBalance: 1000,
        currentBalance: 700,
    });
    assert.strictEqual(views['1w'].anchorBalance, 600);
    // Punto precedente esistente: l'ancora resta a fromMs, la retta è legittima.
    assert.strictEqual(views['1w'].anchorMs, 250);
    assert.strictEqual(views['1w'].fromMs, 250);
    assert.strictEqual(views['1w'].label, '1 settimana');
    assert.ok(Math.abs(views['1w'].gainPct - (100 / 600) * 100) < 1e-9);
});

test('buildRangeViews: senza punti precedenti usa il primo punto del periodo', () => {
    const views = buildRangeViews({
        series: [{ t: 300, balance: 700 }, { t: 400, balance: 800 }],
        windows: [{ key: '6m', label: '6 mesi', fromMs: 100 }],
        baselineBalance: 1000,
        currentBalance: 800,
    });
    assert.strictEqual(views['6m'].anchorBalance, 700);
    // Nessun punto prima della finestra: l'ancora si sposta sul tempo del primo
    // punto del periodo, niente tratto piatto inventato prima di esso.
    assert.strictEqual(views['6m'].anchorMs, 300);
});

test('buildRangeViews: serie vuota -> ancora = balance attuale, guadagno 0', () => {
    const views = buildRangeViews({
        series: [],
        windows: [{ key: '1m', label: '1 mese', fromMs: 100 }],
        baselineBalance: 1000,
        currentBalance: 900,
    });
    assert.strictEqual(views['1m'].anchorBalance, 900);
    assert.strictEqual(views['1m'].anchorMs, 100);
    assert.strictEqual(views['1m'].gainPct, 0);
});

test('buildRangeViews: la vista conn resta ancorata alla baseline', () => {
    const views = buildRangeViews({
        series: [{ t: 100, balance: 500 }],
        windows: [{ key: 'conn', label: 'Dalla connessione', fromMs: 50 }],
        baselineBalance: 400,
        currentBalance: 500,
    });
    assert.strictEqual(views.conn.anchorBalance, 400);
    assert.strictEqual(views.conn.anchorMs, 50);
    assert.ok(Math.abs(views.conn.gainPct - 25) < 1e-9);
});

test('buildRangeViews: serie disordinata o con valori invalidi', () => {
    const views = buildRangeViews({
        series: [{ t: 300, balance: 700 }, { t: NaN, balance: 1 }, { t: 100, balance: 500 }, { t: 200, balance: NaN }],
        windows: [{ key: '1w', label: '1 settimana', fromMs: 250 }],
        baselineBalance: 1000,
        currentBalance: 700,
    });
    assert.strictEqual(views['1w'].anchorBalance, 500);
});
