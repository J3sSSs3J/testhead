# Viste temporali del grafico Performance — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Il grafico Performance del Portfolio offre cinque viste temporali — 1 settimana, 1 mese, 3 mesi, 6 mesi e "Dalla connessione" — che mostrano anche lo storico precedente alla connessione, con due KPI affiancati (percentuale del periodo selezionato e percentuale dalla connessione).

**Architecture:** Il server recupera una sola volta i trade chiusi della finestra più ampia (6 mesi indietro, o `connectedAt` se più vecchio) e li tiene in cache in memoria per 2 minuti; la risposta di `/api/performance` porta la serie completa più i metadati di ogni vista (inizio, balance di riferimento, percentuale), calcolati da funzioni pure testate. Il frontend ritaglia la serie per timestamp al cambio di chip, senza ulteriori chiamate di rete.

**Tech Stack:** Node 18+ (Express, ws, dotenv — già presenti), `node:test`, vanilla JS/CSS senza bundler né librerie di charting.

**Spec:** `docs/superpowers/specs/2026-07-26-viste-temporali-performance-design.md`

**Punto di partenza:** branch `feature/performance-clienti`, suite 12/12 PASS (`npm test` → `node --test test/**/*.test.js`).

## Global Constraints

- **Zero nuove dipendenze npm**; test con `node:test` built-in.
- **Sola lettura**: nessun endpoint di trading.
- **Frontend vanilla**: niente bundler, niente librerie di charting; SVG generato a mano.
- **CSS con le sole variabili esistenti** di `public/style.css`: `--brass`, `--brass-hi`, `--brass-wash`, `--brass-line`, `--ink`, `--line`, `--line-soft`, `--faint`, `--muted`, `--text`, `--font-mono`, `--ease`.
- **Percentuali sempre col pattern accessibile** `pnlParts` (freccia ▲/▼ + segno, mai solo colore).
- **Testi UI in italiano.**
- **Durate delle finestre**: 7, 30, 90, 180 giorni; chiavi `1w`, `1m`, `3m`, `6m`, `conn`.
- **La vista `conn` non deve cambiare comportamento**: riferimento = `baselineBalance` a `connectedAt`.
- **Ogni modifica a `public/`** richiede il bump del parametro `?v=` in `public/index.html` (convenzione del repo per il cache busting).
- **Comandi git sempre con prefisso `rtk`**; i commit terminano con `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

---

### Task 1: Helper puri delle viste (`lib/performance.js`)

**Files:**
- Modify: `lib/performance.js` (aggiunte in coda + export)
- Test: `test/performance.test.js` (aggiunte in coda)

**Interfaces:**
- Consumes: `computeGainPct(baselineBalance, currentBalance) → number|null` già presente nello stesso file.
- Produces (usati dal Task 2):
  - `rangeWindows(nowMs: number, connectedAtMs: number) → [{ key, label, fromMs }]` — cinque elementi nell'ordine `1w`, `1m`, `3m`, `6m`, `conn`.
  - `buildRangeViews({ series: [{t, balance}], windows, baselineBalance: number, currentBalance: number }) → { [key]: { fromMs, label, anchorBalance, gainPct } }`.

- [ ] **Step 1: Scrivi i test (falliranno)**

Aggiungi in coda a `test/performance.test.js`:

```js
const { rangeWindows, buildRangeViews } = require('../lib/performance');

const DAY = 24 * 60 * 60 * 1000;

test('rangeWindows: cinque finestre nell ordine atteso con inizi corretti', () => {
    const now = 1_000_000_000_000;
    const conn = now - 3 * DAY;
    const w = rangeWindows(now, conn);
    assert.deepStrictEqual(w.map(x => x.key), ['1w', '1m', '3m', '6m', 'conn']);
    assert.strictEqual(w[0].fromMs, now - 7 * DAY);
    assert.strictEqual(w[1].fromMs, now - 30 * DAY);
    assert.strictEqual(w[2].fromMs, now - 90 * DAY);
    assert.strictEqual(w[3].fromMs, now - 180 * DAY);
    assert.strictEqual(w[4].fromMs, conn);
    assert.strictEqual(w[4].label, 'Dalla connessione');
    assert.strictEqual(w[0].label, '1 settimana');
});

test('buildRangeViews: ancora = ultimo punto prima della finestra', () => {
    const views = buildRangeViews({
        series: [{ t: 100, balance: 500 }, { t: 200, balance: 600 }, { t: 300, balance: 700 }],
        windows: [{ key: '1w', label: '1 settimana', fromMs: 250 }],
        baselineBalance: 1000,
        currentBalance: 700,
    });
    assert.strictEqual(views['1w'].anchorBalance, 600);
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
});

test('buildRangeViews: serie vuota -> ancora = balance attuale, guadagno 0', () => {
    const views = buildRangeViews({
        series: [],
        windows: [{ key: '1m', label: '1 mese', fromMs: 100 }],
        baselineBalance: 1000,
        currentBalance: 900,
    });
    assert.strictEqual(views['1m'].anchorBalance, 900);
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
```

- [ ] **Step 2: Esegui i test e verifica che falliscano**

Run: `npm test`
Expected: FAIL — `rangeWindows is not a function` (i 12 test esistenti restano PASS)

- [ ] **Step 3: Implementa gli helper**

In `lib/performance.js`, prima della riga `module.exports`, aggiungi:

```js
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
```

E sostituisci l'ultima riga del file con:

```js
module.exports = { buildPerformancePoints, computeGainPct, nextDealCursor, rangeWindows, buildRangeViews };
```

- [ ] **Step 4: Esegui i test e verifica che passino**

Run: `npm test`
Expected: PASS (18 test totali)

- [ ] **Step 5: Commit**

```bash
rtk git add lib/performance.js test/performance.test.js
rtk git commit -m "feat: helper puri per le finestre temporali del grafico performance

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Cache dei deal + risposta estesa (`server.js`)

**Files:**
- Modify: `server.js` (require dei helper; costanti + `getClosingSeries` accanto a `collectClosingDeals`; corpo di `GET /api/performance`)
- Modify: `README.md` (descrizione della riga `/api/performance`)

**Interfaces:**
- Consumes: `rangeWindows(nowMs, connectedAtMs)` e `buildRangeViews({series, windows, baselineBalance, currentBalance})` (Task 1); `collectClosingDeals(accountId, fromMs, toMs) → [{t, balance}]`, `buildPerformancePoints`, `computeGainPct` già presenti.
- Produces (consumato dal Task 3): la risposta di `GET /api/performance?accountId=…` guadagna tre campi, i preesistenti restano invariati:
  - `series: [{t: number, balance: number}]` — punti della finestra più ampia, ordinati per `t`
  - `ranges: { '1w'|'1m'|'3m'|'6m'|'conn': { fromMs, label, anchorBalance, gainPct } }`
  - `nowMs: number` — istante del calcolo, usato dal frontend per l'ultimo punto della curva

- [ ] **Step 1: Aggiungi i due nuovi helper al require esistente**

In `server.js`, la riga che importa da `./lib/performance` diventa:

```js
const { buildPerformancePoints, computeGainPct, nextDealCursor, rangeWindows, buildRangeViews } = require('./lib/performance');
```

- [ ] **Step 2: Aggiungi cache e finestra massima accanto a `collectClosingDeals`**

Subito **dopo** la funzione `collectClosingDeals` (e prima del commento `// --- API: Performance …`), inserisci:

```js
const SIX_MONTHS_MS = 180 * 24 * 60 * 60 * 1000;
const DEALS_CACHE_TTL_MS = 2 * 60 * 1000;

// accountId -> { fromMs, fetchedAt, series }
const dealsCache = new Map();

// Sei mesi di storico sono ~26 richieste sequenziali a cTrader (le finestre di
// OA_DEAL_LIST_REQ sono di 7 giorni): rifarle a ogni interazione renderebbe il
// cambio vista inutilizzabile. La voce si riusa solo se copre la finestra
// richiesta ed è più recente del TTL; entro quel minuto scarso la serie può
// non includere un trade appena chiuso, ma il balance attuale è sempre fresco.
async function getClosingSeries(ctidTraderAccountId, fromMs, toMs) {
    const cached = dealsCache.get(ctidTraderAccountId);
    if (cached && cached.fromMs <= fromMs && (Date.now() - cached.fetchedAt) < DEALS_CACHE_TTL_MS) {
        return cached.series;
    }
    const series = await collectClosingDeals(ctidTraderAccountId, fromMs, toMs);
    dealsCache.set(ctidTraderAccountId, { fromMs, fetchedAt: Date.now(), series });
    return series;
}
```

- [ ] **Step 3: Estendi il corpo dell'endpoint `/api/performance`**

Nell'handler `app.get('/api/performance', …)`, sostituisci il blocco che va da `// Se lo storico fallisce…` fino alla fine di `res.json({…})` con:

```js
        // La finestra recuperata copre la vista più lunga: sei mesi, o la
        // connessione se è più vecchia.
        const windowFromMs = Math.min(nowMs - SIX_MONTHS_MS, connectedAtMs);

        // Se lo storico fallisce la curva degrada ad assente, ma i KPI
        // (baseline -> attuale) restano calcolabili: niente 500 totale.
        let series = [];
        let historyError = null;
        try {
            series = await getClosingSeries(accountId, windowFromMs, nowMs);
        } catch (err) {
            historyError = err.message;
            console.error(`[API] Storico performance non disponibile per ${accountId}: ${err.message}`);
        }

        const windows = rangeWindows(nowMs, connectedAtMs);

        res.json({
            connectedAt: entry.connectedAt,
            baselineBalance: entry.baselineBalance,
            currentBalance,
            nowMs,
            gainPct: computeGainPct(entry.baselineBalance, currentBalance),
            points: historyError ? [] : buildPerformancePoints({
                connectedAtMs,
                baselineBalance: entry.baselineBalance,
                deals: series,
                nowMs,
                currentBalance,
            }),
            series: historyError ? [] : series,
            ranges: buildRangeViews({
                series: historyError ? [] : series,
                windows,
                baselineBalance: entry.baselineBalance,
                currentBalance,
            }),
            historyError,
        });
```

- [ ] **Step 4: Aggiorna la riga del README**

In `README.md`, sostituisci la riga della tabella che descrive `/api/performance` con:

```markdown
| `GET /api/performance?accountId=…` | Serie del balance (fino a 6 mesi, in cache 2 minuti) con le viste 1 settimana / 1 mese / 3 mesi / 6 mesi / dalla connessione |
```

- [ ] **Step 5: Verifica**

Run: `npm test` → Expected: PASS (18 test)
Run: `node --check server.js` → Expected: nessun output
Avvia il server per qualche secondo (`node server.js`, poi terminalo): Expected: banner di avvio, nessuna eccezione.

- [ ] **Step 6: Commit**

```bash
rtk git add server.js README.md
rtk git commit -m "feat: serie a sei mesi in cache e metadati delle viste in /api/performance

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Selettore di periodo e doppio KPI (frontend)

**Files:**
- Modify: `public/auto-data.js` (costruttore, `selectAccount`, nuovi metodi, `perfCard`, `perfChart`, `showAllData`)
- Modify: `public/style.css` (blocco `PERFORMANCE CHART`)
- Modify: `public/index.html` (bump `?v=` dei due asset)

**Interfaces:**
- Consumes: la risposta di `GET /api/performance` con `series`, `ranges`, `nowMs` (Task 2); i metodi esistenti `pnlParts(v) → {cls, arrow, text}`, `fmtNum(v, digits)`, `perfChart`, `bindPerfHover`.
- Produces: UI finale; nessun task successivo.

- [ ] **Step 1: Stato del selettore nel costruttore**

In `public/auto-data.js` il costruttore diventa:

```js
  constructor() {
    this.accounts = [];
    this.selectedAccountId = null;
    // Vista del grafico Performance: 6 mesi mostra subito lo storico più ampio.
    this.perfRange = '6m';
    this.perfData = null;
  }
```

E in `selectAccount`, subito dopo `this.selectedAccountId = parseInt(id, 10);`, aggiungi:

```js
    this.perfRange = '6m';
```

- [ ] **Step 2: Aggiungi i metodi delle viste**

In `public/auto-data.js`, **prima** del metodo `perfCard(performance)`, inserisci:

```js
  // Percentuale con freccia e segno; 'N/A' quando non è calcolabile
  // (ancora non positiva o dato mancante).
  pctParts(v) {
    return (typeof v === 'number' && isFinite(v))
        ? this.pnlParts(v)
        : { cls: 'na', arrow: '', text: 'N/A' };
  }

  pctTile(title, value, sub) {
    const p = this.pctParts(value);
    return `
      <div class="stat-tile">
        <div class="stat-k">${title}</div>
        <div class="stat-v ${p.cls}">${p.arrow ? `<span class="arrow" aria-hidden="true">${p.arrow}</span> ` : ''}${p.text}${p.text !== 'N/A' ? '<span class="stat-unit">%</span>' : ''}</div>
        <div class="stat-sub">${sub}</div>
      </div>`;
  }

  // Punti della vista selezionata: ancora del periodo in testa, trade chiusi
  // del periodo, balance attuale in coda. Nessuna chiamata di rete: la serie
  // completa arriva già con la risposta.
  perfViewPoints(performance, key) {
    const view = performance && performance.ranges ? performance.ranges[key] : null;
    if (!view) return [];
    const series = Array.isArray(performance.series) ? performance.series : [];
    const points = [{ t: view.fromMs, balance: view.anchorBalance }];
    for (const p of series) {
        if (p.t >= view.fromMs) points.push({ t: p.t, balance: p.balance });
    }
    points.push({ t: performance.nowMs, balance: performance.currentBalance });
    return points;
  }

  perfChips() {
    const chips = [['1w', '1S'], ['1m', '1M'], ['3m', '3M'], ['6m', '6M'], ['conn', 'Dalla connessione']];
    return `
      <div class="perf-ranges" role="group" aria-label="Periodo del grafico">
        ${chips.map(([key, label]) => `
          <button type="button" class="perf-chip${this.perfRange === key ? ' is-active' : ''}"
                  aria-pressed="${this.perfRange === key}"
                  onclick="autoData.setPerfRange('${key}')">${label}</button>`).join('')}
      </div>`;
  }

  // Cambio vista: ridisegna la sola card Performance con i dati già in memoria.
  setPerfRange(key) {
    if (!this.perfData || this.perfRange === key) return;
    this.perfRange = key;
    const host = document.querySelector('.perf-card');
    if (!host) return;
    const wrap = document.createElement('div');
    wrap.innerHTML = this.perfCard(this.perfData);
    const fresh = wrap.firstElementChild;
    if (!fresh) return;
    host.replaceWith(fresh);
    this.perfPoints = this.perfViewPoints(this.perfData, key);
    this.bindPerfHover(fresh);
  }
```

- [ ] **Step 3: Riscrivi `perfCard`**

Sostituisci l'intero metodo `perfCard(performance)` con:

```js
  perfCard(performance) {
    if (!performance || performance.__error) {
      return `
      <div class="card perf-card">
        <div class="card-h">Performance</div>
        <div class="pf-empty">Dati performance non disponibili${performance && performance.__error ? `: ${performance.__error}` : ''}.</div>
      </div>`;
    }
    const connDate = this.fmtDay(performance.connectedAt);
    const view = performance.ranges ? performance.ranges[this.perfRange] : null;
    const points = this.perfViewPoints(performance, this.perfRange);
    return `
      <div class="card perf-card">
        <div class="card-h">Performance <span class="count">(${view ? view.label : 'periodo'})</span></div>
        ${this.perfChips()}
        <div class="perf-kpis">
          ${this.pctTile(
              `Periodo · ${view ? view.label : 'N/A'}`,
              view ? view.gainPct : null,
              view ? `riferimento ${this.fmtNum(view.anchorBalance)} → attuale ${this.fmtNum(performance.currentBalance)}` : 'dati non disponibili')}
          ${this.pctTile(
              'Dalla connessione',
              performance.gainPct,
              `dal ${connDate} · baseline ${this.fmtNum(performance.baselineBalance)}`)}
        </div>
        ${points.length >= 2
            ? this.perfChart(points, view ? view.anchorBalance : performance.baselineBalance, view ? view.label : '')
            : `<div class="pf-empty">${performance.historyError
                ? `Storico non disponibile: ${performance.historyError}`
                : 'La curva apparirà con i primi trade del periodo.'}</div>`}
      </div>`;
  }

  // Data in formato breve, 'N/A' se il valore non è una data valida.
  fmtDay(iso) {
    const d = new Date(iso);
    return isNaN(d) ? 'N/A' : d.toLocaleDateString('it-IT');
  }
```

- [ ] **Step 4: Rendi il grafico consapevole del periodo**

In `perfChart`, cambia la firma e l'etichetta accessibile. La riga della firma diventa:

```js
  perfChart(points, baseline, periodLabel) {
```

e nel markup restituito la riga dell'`aria-label` diventa:

```js
             aria-label="Andamento del balance${periodLabel ? ` · ${periodLabel}` : ''}: da ${this.fmtNum(first.balance)} a ${this.fmtNum(last.balance)}">
```

- [ ] **Step 5: Aggancia i dati in `showAllData`**

In `showAllData`, sostituisci la riga che assegna `this.perfPoints` con:

```js
    this.perfData = (performance && !performance.__error) ? performance : null;
    this.perfPoints = this.perfData ? this.perfViewPoints(this.perfData, this.perfRange) : null;
```

- [ ] **Step 6: Stili delle chip e dei KPI affiancati**

In `public/style.css`, dentro il blocco `/* ==================== PERFORMANCE CHART ==================== */`, sostituisci la regola `.perf-kpis { margin-bottom: 14px; }` con:

```css
.perf-kpis {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 10px;
  margin-bottom: 14px;
}
.perf-ranges { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 12px; }
.perf-chip {
  font-family: var(--font-mono); font-size: 11px; letter-spacing: 0.04em;
  color: var(--muted); background: transparent;
  border: 1px solid var(--line); border-radius: 999px;
  padding: 5px 12px; cursor: pointer;
  transition: color 0.18s var(--ease), border-color 0.18s var(--ease), background 0.18s var(--ease);
}
.perf-chip:hover { color: var(--text); border-color: var(--brass-line); }
.perf-chip.is-active { color: var(--ink); background: var(--brass); border-color: var(--brass); }
.perf-chip:focus-visible { outline: 2px solid var(--brass); outline-offset: 2px; }
```

- [ ] **Step 7: Bump del cache busting**

In `public/index.html`: `style.css?v=9` → `style.css?v=10`, e `auto-data.js?v=7` → `auto-data.js?v=8`. Gli altri asset (`main.js`, `stars.js`) non si toccano: non sono modificati da questo piano.

- [ ] **Step 8: Verifica**

Run: `node --check public/auto-data.js` → Expected: nessun output
Run: `npm test` → Expected: PASS (18 test — regressione backend, il frontend non è coperto)

Verifica manuale (richiede login cTrader): apri il Portfolio; la card mostra cinque chip con **6M** attiva, due KPI affiancati e la curva del semestre. Cliccando **1S** la curva si restringe e il KPI "Periodo" cambia, mentre "Dalla connessione" resta identico; nessuna richiesta di rete compare nella scheda Network. Il tooltip continua a funzionare dopo il cambio vista. A ~375px di larghezza i KPI si impilano e le chip vanno a capo senza overflow orizzontale.

- [ ] **Step 9: Commit**

```bash
rtk git add public/auto-data.js public/style.css public/index.html
rtk git commit -m "feat: selettore di periodo e doppio KPI sul grafico Performance

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```
