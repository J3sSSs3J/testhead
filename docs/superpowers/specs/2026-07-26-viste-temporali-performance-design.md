# Viste temporali del grafico Performance — design

Data: 2026-07-26
Stato: approvato

## Obiettivo

Il grafico Performance del Portfolio parte dal giorno della prima connessione:
per un conto connesso oggi copre poche ore ed è poco informativo. Aggiungere
cinque viste temporali — 1 settimana, 1 mese, 3 mesi, 6 mesi e "Dalla
connessione" — che mostrino anche lo storico **precedente** alla connessione,
recuperabile da cTrader perché ogni trade chiuso porta con sé il balance
risultante.

Estende la feature descritta in
`2026-07-26-performance-clienti-design.md` (branch `feature/performance-clienti`).

## Requisiti

1. Cinque viste selezionabili: `1w`, `1m`, `3m`, `6m`, `conn`.
2. Le viste temporali mostrano lo storico completo del periodo, anche prima
   della data di connessione.
3. Due KPI affiancati e sempre entrambi visibili: percentuale del **periodo
   selezionato** e percentuale **dalla connessione** (ancorata alla baseline).
4. La vista "Dalla connessione" mantiene esattamente il comportamento attuale:
   riferimento = `baselineBalance` al giorno della connessione.
5. Cambiare vista non deve richiedere una nuova chiamata al server.

## Vincolo rilevato

`OA_DEAL_LIST_REQ` accetta finestre di 7 giorni: sei mesi di storico sono ~26
richieste sequenziali sul WebSocket. Recuperarle a ogni cambio vista renderebbe
l'interazione inutilizzabile.

## Approcci considerati

- **A. Un fetch della finestra più ampia + cache + viste calcolate** (scelto):
  il server recupera una volta i deal della finestra più ampia (6 mesi indietro,
  o `connectedAt` se più vecchio), li tiene in cache per account, e restituisce
  la serie completa più i metadati di ogni vista. Il frontend ritaglia per
  timestamp. Un solo costo di rete, cambio vista istantaneo.
- **B. Un fetch per vista con parametro `range`** — risposta più piccola, ma ogni
  cambio vista paga fino a 26 round-trip; scartato.
- **C. Tutte le viste pre-renderizzate lato server** — ridondanza dei punti
  (6m contiene 3m contiene 1m) senza vantaggi; scartato.

## Design

### Cache dei deal (`server.js`)

- `dealsCache: Map(accountId → { fromMs, fetchedAt, deals })`, TTL **2 minuti**.
- Riuso solo se la voce copre la finestra richiesta (`cached.fromMs <= fromMs`)
  ed è ancora valida; altrimenti fetch e sostituzione.
- La cache contiene solo punti `{t, balance}` derivati dai deal: nessun token,
  nessun dato sensibile.

### Helper puri (`lib/performance.js`)

- `rangeWindows(nowMs, connectedAtMs) → [{ key, label, fromMs }]` — le cinque
  finestre: `1w`/`1m`/`3m`/`6m` calcolate all'indietro da `nowMs`, `conn` a
  `connectedAtMs`. Durate in giorni: 7, 30, 90, 180.
- `buildRangeViews({ series, windows, connectedAtMs, baselineBalance, currentBalance, nowMs }) → { [key]: { fromMs, anchorBalance, gainPct } }`
  - `conn`: `anchorBalance = baselineBalance` — invariato rispetto a oggi.
  - viste temporali: `anchorBalance` = balance dell'ultimo punto **strettamente
    precedente** a `fromMs`; se assente, balance del primo punto nel periodo;
    se la serie è vuota, `currentBalance`.
  - `gainPct = computeGainPct(anchorBalance, currentBalance)` (già esistente:
    `null` se l'ancora non è positiva).

### Endpoint `GET /api/performance?accountId=…`

Nessun parametro nuovo. La risposta si estende (campi esistenti invariati, il
frontend vecchio continuerebbe a funzionare):

```
{
  connectedAt, baselineBalance, currentBalance,
  gainPct,          // dalla connessione — invariato
  points,           // vista "conn" — invariato
  series,           // NUOVO: punti della finestra più ampia, ordinati per t
  ranges,           // NUOVO: { '1w'|'1m'|'3m'|'6m'|'conn': {fromMs, anchorBalance, gainPct} }
  historyError
}
```

La finestra recuperata è `min(nowMs − 180 giorni, connectedAtMs)`.

### Frontend (`public/auto-data.js`, `public/style.css`)

- Riga di chip sopra il grafico: **1S · 1M · 3M · 6M · Dalla connessione**.
  Stile del design system (bordo `--line`, chip attiva in `--brass`), markup
  `<button>` con `aria-pressed`; la selezione vive in `this.perfRange`
  (default `'6m'`) e sopravvive al cambio vista, non al cambio account.
- Cambio vista: filtro di `series` per `t >= fromMs`, con il punto d'ancora in
  testa e il balance attuale in coda; ridisegno del solo blocco grafico e
  re-bind dell'hover.
- KPI affiancati: "Periodo · `<label>`" (percentuale della vista) e "Dalla
  connessione" (percentuale dalla baseline), entrambi col pattern accessibile
  `pnlParts` (freccia ▲/▼ + segno, mai solo colore).

## Error handling

- Storico non recuperabile: `series: []`, `ranges` con `gainPct: null`,
  `historyError` valorizzato; la card mostra l'avviso e il KPI dalla connessione
  resta calcolabile — come oggi.
- Periodo senza trade: linea piatta dall'ancora al balance attuale, percentuale
  del periodo `0`.
- Risposta in errore (`__error`, incluso il 503 "connessione non registrata"):
  card di fallback esistente, invariata.

## Testing

`node:test` sui nuovi helper puri:

1. `rangeWindows`: cinque chiavi, `fromMs` corretti per 7/30/90/180 giorni,
   `conn` uguale a `connectedAtMs`.
2. `buildRangeViews`: ancora presa dall'ultimo punto precedente alla finestra;
   fallback al primo punto quando non esiste un precedente; serie vuota →
   ancora `currentBalance`; vista `conn` sempre ancorata a `baselineBalance`.
3. Regressione: `computeGainPct` restituisce `null` con ancora ≤ 0.

Verifica manuale (richiede login cTrader): le cinque chip cambiano la finestra
senza chiamate di rete aggiuntive; il KPI "Dalla connessione" non cambia mai al
variare della vista.

## Limiti dichiarati

- Il primo caricamento paga fino a ~26 round-trip cTrader (finestre di 7 giorni);
  la cache di 2 minuti evita che si ripeta a ogni interazione.
- La curva resta piatta tra un trade chiuso e l'altro; depositi e prelievi
  compaiono al trade successivo.
- Le viste più lunghe dello storico disponibile mostrano solo ciò che esiste.

## Aggiornamento (26/07/2026, dopo la verifica sul conto reale)

Con la finestra a sei mesi lo storico veniva **rifiutato da cTrader**: la
documentazione ([Getting started](https://help.ctrader.com/open-api/)) fissa un
massimo di **5 richieste al secondo per connessione** sulle richieste di dati
storici, e le ~26 richieste consecutive del chunking settimanale lo superavano
ampiamente. Il chunking stesso era infondato: il limite di 604800000 ms
riguarda i dati tick e il cash flow, **non** `ProtoOADealListReq`, che non ha
limite di periodo.

Correzioni applicate:

- `collectClosingDeals` chiede l'**intera finestra in una sola richiesta**;
  restano solo le iterazioni di paginazione quando i deal superano `maxRows`.
- Throttle di 250 ms tra richieste storiche (4/s, sotto il limite di 5/s),
  a protezione della paginazione e di ogni chiamante futuro.
- Aggiunta la vista **1 anno** (`1y`, 365 giorni): con una sola richiesta costa
  quanto una settimana. La finestra recuperata diventa
  `historyWindowStart(nowMs, connectedAtMs)` = il più indietro tra un anno fa e
  la connessione; la durata deriva dalla vista più lunga, così aggiungerne una
  non richiede di aggiornare due punti.
- Con storico fallito e serie vuota la curva non viene più disegnata: restava
  una retta piatta di due punti sintetici accanto all'avviso, leggibile come
  andamento costante misurato invece che come dato assente.

Il limite dichiarato "il primo caricamento paga ~26 round-trip" non vale più:
è una richiesta sola.

## Fuori scope

- Downsampling dei punti (uno per trade chiuso è adeguato ai volumi attesi).
- Selettore di intervallo personalizzato (date arbitrarie).
- Cache persistente su disco.
