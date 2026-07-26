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

module.exports = { buildPerformancePoints, computeGainPct, nextDealCursor };
