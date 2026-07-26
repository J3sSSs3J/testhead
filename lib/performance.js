// Costruzione della curva performance dal giorno della connessione.
// Tutti i balance sono già in unità reali (divisi per 10^moneyDigits).

// Punti della curva: baseline al giorno della connessione, un punto per ogni
// trade chiuso (balance DOPO la chiusura), balance attuale come ultimo punto.
// Tra un trade e l'altro la curva è piatta per definizione (limite di spec).
function buildPerformancePoints({ connectedAtMs, baselineBalance, deals, nowMs, currentBalance }) {
    const mid = deals
        .filter(d => Number.isFinite(d.t) && Number.isFinite(d.balance)
            && d.t >= connectedAtMs && d.t <= nowMs)
        .sort((a, b) => a.t - b.t)
        .map(d => ({ t: d.t, balance: d.balance }));
    const points = [{ t: connectedAtMs, balance: baselineBalance }, ...mid];
    if (Number.isFinite(currentBalance)) points.push({ t: nowMs, balance: currentBalance });
    return points;
}

// null se la baseline non è positiva (conto connesso prima del primo
// deposito): il frontend mostra "N/A" invece di una divisione per zero.
function computeGainPct(baselineBalance, currentBalance) {
    if (!Number.isFinite(baselineBalance) || baselineBalance <= 0) return null;
    if (!Number.isFinite(currentBalance)) return null;
    return ((currentBalance - baselineBalance) / baselineBalance) * 100;
}

// Cursore per la lettura a blocchi dei deal: con hasMore si riparte
// dall'ultimo deal ricevuto (+1ms), ma mai all'indietro né oltre il blocco;
// senza progresso reale si salta comunque al blocco successivo (anti-loop).
function nextDealCursor({ hasMore, lastDealTimestamp }, cursor, chunkEnd) {
    if (hasMore && Number.isFinite(lastDealTimestamp) && lastDealTimestamp + 1 > cursor) {
        return Math.min(lastDealTimestamp + 1, chunkEnd);
    }
    return chunkEnd;
}

const DAY_MS = 24 * 60 * 60 * 1000;

// Le finestre a durata fissa; l'ultima ("conn") parte dal giorno della
// connessione ed è la sola ancorata alla baseline registrata.
const FIXED_RANGES = [
    { key: '1w', label: '1 settimana', days: 7 },
    { key: '1m', label: '1 mese', days: 30 },
    { key: '3m', label: '3 mesi', days: 90 },
    { key: '6m', label: '6 mesi', days: 180 },
    { key: '1y', label: '1 anno', days: 365 },
];

// Durata della vista più lunga: definisce quanto storico va recuperato.
const LONGEST_RANGE_DAYS = FIXED_RANGES[FIXED_RANGES.length - 1].days;

function rangeWindows(nowMs, connectedAtMs) {
    const windows = FIXED_RANGES.map(r => ({
        key: r.key,
        label: r.label,
        fromMs: nowMs - r.days * DAY_MS,
    }));
    windows.push({ key: 'conn', label: 'Dalla connessione', fromMs: connectedAtMs });
    return windows;
}

// Inizio della finestra da recuperare: abbraccia sia la vista più lunga sia la
// vista "dalla connessione", quale delle due vada più indietro.
function historyWindowStart(nowMs, connectedAtMs) {
    return Math.min(nowMs - LONGEST_RANGE_DAYS * DAY_MS, connectedAtMs);
}

// Riferimento di una finestra: tempo e balance del punto usato come ancora
// della curva. Con un trade STRETTAMENTE precedente all'inizio della finestra,
// il balance era davvero quello per tutto l'intervallo: l'ancora resta a
// fromMs (retta legittima). Senza un trade precedente non esiste alcun dato
// prima del primo punto del periodo, quindi l'ancora si sposta sul suo tempo
// (niente tratto piatto inventato). Con la serie vuota l'ancora è il balance
// attuale, piazzata a fromMs.
function anchorFor(sorted, fromMs, currentBalance) {
    let before = null;
    for (const p of sorted) {
        if (p.t >= fromMs) break;
        before = p;
    }
    if (before) return { anchorMs: fromMs, anchorBalance: before.balance };
    const first = sorted.find(p => p.t >= fromMs);
    if (first) return { anchorMs: first.t, anchorBalance: first.balance };
    return { anchorMs: fromMs, anchorBalance: currentBalance };
}

function buildRangeViews({ series, windows, baselineBalance, currentBalance }) {
    const sorted = (Array.isArray(series) ? series : [])
        .filter(p => Number.isFinite(p.t) && Number.isFinite(p.balance))
        .sort((a, b) => a.t - b.t);

    const views = {};
    for (const w of windows) {
        const { anchorMs, anchorBalance } = w.key === 'conn'
            ? { anchorMs: w.fromMs, anchorBalance: baselineBalance }
            : anchorFor(sorted, w.fromMs, currentBalance);
        views[w.key] = {
            fromMs: w.fromMs,
            label: w.label,
            anchorMs,
            anchorBalance,
            gainPct: computeGainPct(anchorBalance, currentBalance),
        };
    }
    return views;
}

module.exports = {
    buildPerformancePoints,
    computeGainPct,
    nextDealCursor,
    rangeWindows,
    historyWindowStart,
    buildRangeViews,
};
