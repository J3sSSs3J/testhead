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

// Le quattro finestre a durata fissa; la quinta ("conn") parte dal giorno
// della connessione ed è l'unica ancorata alla baseline registrata.
const FIXED_RANGES = [
    { key: '1w', label: '1 settimana', days: 7 },
    { key: '1m', label: '1 mese', days: 30 },
    { key: '3m', label: '3 mesi', days: 90 },
    { key: '6m', label: '6 mesi', days: 180 },
];

function rangeWindows(nowMs, connectedAtMs) {
    const windows = FIXED_RANGES.map(r => ({
        key: r.key,
        label: r.label,
        fromMs: nowMs - r.days * DAY_MS,
    }));
    windows.push({ key: 'conn', label: 'Dalla connessione', fromMs: connectedAtMs });
    return windows;
}

// Riferimento di una finestra: il balance dell'ultimo trade chiuso
// STRETTAMENTE precedente al suo inizio, così il primo trade del periodo entra
// nel calcolo. Senza un trade precedente si parte dal primo punto disponibile;
// con la serie vuota la curva è piatta sul balance attuale.
function anchorBalanceFor(sorted, fromMs, currentBalance) {
    let before = null;
    for (const p of sorted) {
        if (p.t >= fromMs) break;
        before = p;
    }
    if (before) return before.balance;
    const first = sorted.find(p => p.t >= fromMs);
    return first ? first.balance : currentBalance;
}

function buildRangeViews({ series, windows, baselineBalance, currentBalance }) {
    const sorted = (Array.isArray(series) ? series : [])
        .filter(p => Number.isFinite(p.t) && Number.isFinite(p.balance))
        .sort((a, b) => a.t - b.t);

    const views = {};
    for (const w of windows) {
        const anchorBalance = w.key === 'conn'
            ? baselineBalance
            : anchorBalanceFor(sorted, w.fromMs, currentBalance);
        views[w.key] = {
            fromMs: w.fromMs,
            label: w.label,
            anchorBalance,
            gainPct: computeGainPct(anchorBalance, currentBalance),
        };
    }
    return views;
}

module.exports = { buildPerformancePoints, computeGainPct, nextDealCursor, rangeWindows, buildRangeViews };
