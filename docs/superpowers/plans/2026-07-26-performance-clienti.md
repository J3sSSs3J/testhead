# Grafico performance per conti connessi — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ogni utente (proprietario o cliente) che fa login cTrader sul sito vede nel Portfolio un grafico di come sta performando il suo conto dal giorno della prima connessione, con sessioni per-browser che isolano gli utenti tra loro.

**Architecture:** Sessioni cookie-based con token cTrader in memoria (un WebSocket condiviso verso cTrader, account auth per-token); registro persistente `data/connections.json` con data di connessione e balance di partenza per account; endpoint `/api/performance` che ricostruisce la curva del balance dai trade chiusi; card frontend con grafico SVG generato a mano.

**Tech Stack:** Node 18+ (Express, ws, dotenv — già presenti), `node:test` per i test, vanilla JS/CSS nel frontend (nessun bundler, nessuna libreria di charting).

**Spec:** `docs/superpowers/specs/2026-07-26-performance-clienti-design.md`

## Global Constraints

- **Zero nuove dipendenze npm**: si usano solo `express`, `ws`, `dotenv` già installate; i test usano `node:test` built-in.
- **Node 18+** (requisito già dichiarato nel README).
- **Sola lettura**: nessun endpoint di trading, mai.
- **Frontend vanilla**: niente bundler; CSS con le variabili esistenti di `public/style.css` (`--brass`, `--brass-wash`, `--brass-hi`, `--ink-2`, `--line-soft`, `--faint`, `--muted`, `--up`, `--down`, `--font-mono`); testi UI in italiano.
- **Grafico**: serie unica color `--brass` (contrasto ≥3:1 su `--ink-2` validato); la % usa i colori `--up`/`--down` **sempre** con freccia ▲/▼ e segno (pattern `pnlParts` esistente, mai solo colore).
- **Comandi git sempre con prefisso `rtk`**: `rtk git add … && rtk git commit …`.
- I commit terminano con `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

---

### Task 1: Test runner + modulo sessioni (`lib/sessions.js`)

**Files:**
- Modify: `package.json` (script `test`)
- Create: `lib/sessions.js`
- Test: `test/sessions.test.js`

**Interfaces:**
- Consumes: niente (primo task).
- Produces: `module.exports = { parseCookies, SessionStore, COOKIE_NAME }`.
  - `parseCookies(header: string|undefined) → { [name]: value }`
  - `COOKIE_NAME = 'ametrades_sid'`
  - `class SessionStore`: `get(req) → session|null`; `ensure(req, res) → session` (crea la sessione e imposta `Set-Cookie` se il browser non ne ha una valida). `session = { sid: string, accessToken: string|null, refreshToken: string|null, accounts: [] }`.

- [ ] **Step 1: Aggiungi lo script test a `package.json`**

Nel blocco `"scripts"`:

```json
"scripts": {
    "start": "node server.js",
    "test": "node --test test/"
}
```

- [ ] **Step 2: Scrivi i test (falliranno)**

Crea `test/sessions.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert');
const { parseCookies, SessionStore, COOKIE_NAME } = require('../lib/sessions');

function fakeReq(cookieHeader) { return { headers: { cookie: cookieHeader } }; }
function fakeRes() {
    const headers = {};
    return { headers, setHeader(k, v) { headers[k] = v; } };
}

test('parseCookies: header assente -> oggetto vuoto', () => {
    assert.deepStrictEqual(parseCookies(undefined), {});
});

test('parseCookies: più cookie con spazi', () => {
    assert.deepStrictEqual(
        parseCookies('a=1; ametrades_sid=abc; b=2'),
        { a: '1', ametrades_sid: 'abc', b: '2' }
    );
});

test('ensure crea la sessione, imposta il cookie e la riusa', () => {
    const store = new SessionStore();
    const res = fakeRes();
    const session = store.ensure(fakeReq(undefined), res);
    assert.ok(session.sid);
    assert.strictEqual(session.accessToken, null);
    assert.deepStrictEqual(session.accounts, []);
    assert.strictEqual(
        res.headers['Set-Cookie'],
        `${COOKIE_NAME}=${session.sid}; Path=/; HttpOnly; SameSite=Lax`
    );
    // Con il cookie del browser, ensure restituisce la STESSA sessione
    const again = store.ensure(fakeReq(`${COOKIE_NAME}=${session.sid}`), fakeRes());
    assert.strictEqual(again, session);
});

test('get: cookie assente o sid sconosciuto -> null', () => {
    const store = new SessionStore();
    assert.strictEqual(store.get(fakeReq(undefined)), null);
    assert.strictEqual(store.get(fakeReq(`${COOKIE_NAME}=nope`)), null);
});
```

- [ ] **Step 3: Esegui i test e verifica che falliscano**

Run: `npm test`
Expected: FAIL con `Cannot find module '../lib/sessions'`

- [ ] **Step 4: Implementa `lib/sessions.js`**

```js
// Sessioni per-browser: cookie ametrades_sid -> stato cTrader in memoria.
// I token NON sono persistiti (come prima della feature): al riavvio del
// server ogni utente rifà il login.
const crypto = require('crypto');

const COOKIE_NAME = 'ametrades_sid';

function parseCookies(header) {
    const out = {};
    if (!header) return out;
    for (const part of header.split(';')) {
        const idx = part.indexOf('=');
        if (idx === -1) continue;
        const name = part.slice(0, idx).trim();
        if (name) out[name] = decodeURIComponent(part.slice(idx + 1).trim());
    }
    return out;
}

class SessionStore {
    constructor() {
        this.sessions = new Map();
    }

    get(req) {
        const sid = parseCookies(req.headers.cookie)[COOKIE_NAME];
        return (sid && this.sessions.get(sid)) || null;
    }

    ensure(req, res) {
        const existing = this.get(req);
        if (existing) return existing;
        const sid = crypto.randomBytes(24).toString('hex');
        const session = { sid, accessToken: null, refreshToken: null, accounts: [] };
        this.sessions.set(sid, session);
        res.setHeader('Set-Cookie', `${COOKIE_NAME}=${sid}; Path=/; HttpOnly; SameSite=Lax`);
        return session;
    }
}

module.exports = { parseCookies, SessionStore, COOKIE_NAME };
```

- [ ] **Step 5: Esegui i test e verifica che passino**

Run: `npm test`
Expected: PASS (4 test)

- [ ] **Step 6: Commit**

```bash
rtk git add package.json lib/sessions.js test/sessions.test.js
rtk git commit -m "feat: modulo sessioni per-browser + test runner node:test

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Registro connessioni persistente (`lib/connections.js`)

**Files:**
- Create: `lib/connections.js`
- Modify: `.gitignore` (aggiungi `data/`)
- Test: `test/connections.test.js`

**Interfaces:**
- Consumes: niente.
- Produces: `module.exports = { ConnectionsRegistry }`.
  - `new ConnectionsRegistry(filePath)` — carica il file se esiste; file corrotto → log e registro vuoto (rischio accettato dalla spec).
  - `get(accountId: number|string) → { connectedAt: string(ISO), baselineBalance: number } | null`
  - `ensure(accountId, entry) → entry` — scrive la voce **solo se assente** e salva su file; una voce esistente non viene MAI sovrascritta.

- [ ] **Step 1: Aggiungi `data/` a `.gitignore`**

`.gitignore` diventa:

```
node_modules/
.env
data/
```

- [ ] **Step 2: Scrivi i test (falliranno)**

Crea `test/connections.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { ConnectionsRegistry } = require('../lib/connections');

// Sottocartella inesistente: verifica anche il mkdir ricorsivo al salvataggio
function tmpFile() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ametrades-test-'));
    return path.join(dir, 'data', 'connections.json');
}

test('ensure crea la voce, la persiste e non la sovrascrive mai', () => {
    const file = tmpFile();
    const reg = new ConnectionsRegistry(file);
    const first = reg.ensure(123, { connectedAt: '2026-07-26T10:00:00.000Z', baselineBalance: 1000 });
    assert.strictEqual(first.baselineBalance, 1000);

    // Secondo ensure con dati diversi: la voce originale resta intatta
    const second = reg.ensure(123, { connectedAt: '2026-08-01T10:00:00.000Z', baselineBalance: 2000 });
    assert.strictEqual(second.baselineBalance, 1000);
    assert.strictEqual(second.connectedAt, '2026-07-26T10:00:00.000Z');

    // Un nuovo registry sullo stesso file rilegge la voce (persistenza)
    const reloaded = new ConnectionsRegistry(file);
    assert.deepStrictEqual(reloaded.get(123), {
        connectedAt: '2026-07-26T10:00:00.000Z',
        baselineBalance: 1000,
    });
});

test('get: account mai connesso -> null', () => {
    const reg = new ConnectionsRegistry(tmpFile());
    assert.strictEqual(reg.get(999), null);
});

test('file corrotto -> registro vuoto senza crash', () => {
    const file = tmpFile();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, '{non-json');
    const reg = new ConnectionsRegistry(file);
    assert.strictEqual(reg.get(1), null);
});
```

- [ ] **Step 3: Esegui i test e verifica che falliscano**

Run: `npm test`
Expected: FAIL con `Cannot find module '../lib/connections'` (i test di sessions restano PASS)

- [ ] **Step 4: Implementa `lib/connections.js`**

```js
// Registro persistente delle connessioni: accountId -> data di prima
// connessione + balance di partenza (baseline). La voce nasce alla prima
// autorizzazione dell'account e non viene mai più toccata: il grafico
// riparte sempre dal giorno originale, anche dopo riavvii e nuovi login.
const fs = require('fs');
const path = require('path');

class ConnectionsRegistry {
    constructor(filePath) {
        this.filePath = filePath;
        this.entries = {};
        try {
            if (fs.existsSync(filePath)) {
                this.entries = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            }
        } catch (err) {
            console.error(`[CONNECTIONS] File illeggibile (${err.message}): riparto con registro vuoto`);
            this.entries = {};
        }
    }

    get(accountId) {
        return this.entries[String(accountId)] || null;
    }

    ensure(accountId, entry) {
        const key = String(accountId);
        if (!this.entries[key]) {
            this.entries[key] = entry;
            this.save();
        }
        return this.entries[key];
    }

    save() {
        fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
        fs.writeFileSync(this.filePath, JSON.stringify(this.entries, null, 2));
    }
}

module.exports = { ConnectionsRegistry };
```

- [ ] **Step 5: Esegui i test e verifica che passino**

Run: `npm test`
Expected: PASS (7 test totali)

- [ ] **Step 6: Commit**

```bash
rtk git add .gitignore lib/connections.js test/connections.test.js
rtk git commit -m "feat: registro persistente delle connessioni account (data/connections.json)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Helper puri della performance (`lib/performance.js`)

**Files:**
- Create: `lib/performance.js`
- Test: `test/performance.test.js`

**Interfaces:**
- Consumes: niente.
- Produces: `module.exports = { buildPerformancePoints, computeGainPct, nextDealCursor }`.
  - `buildPerformancePoints({ connectedAtMs: number, baselineBalance: number, deals: [{t: number, balance: number}], nowMs: number, currentBalance: number }) → [{t, balance}]` — primo punto la baseline, deal filtrati/ordinati in mezzo, balance attuale in coda.
  - `computeGainPct(baselineBalance, currentBalance) → number|null` — `null` se baseline ≤ 0 o valori non finiti (spec: conto connesso prima del primo deposito).
  - `nextDealCursor({hasMore: boolean, lastDealTimestamp: number}, cursor: number, chunkEnd: number) → number` — avanzamento del cursore nella lettura a blocchi, con guardia anti-loop.

- [ ] **Step 1: Scrivi i test (falliranno)**

Crea `test/performance.test.js`:

```js
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
```

- [ ] **Step 2: Esegui i test e verifica che falliscano**

Run: `npm test`
Expected: FAIL con `Cannot find module '../lib/performance'`

- [ ] **Step 3: Implementa `lib/performance.js`**

```js
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
```

- [ ] **Step 4: Esegui i test e verifica che passino**

Run: `npm test`
Expected: PASS (11 test totali)

- [ ] **Step 5: Commit**

```bash
rtk git add lib/performance.js test/performance.test.js
rtk git commit -m "feat: helper puri per curva balance e gain percentuale

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Sessioni multi-utente in `server.js`

**Files:**
- Modify: `server.js` (sezioni STATE, cTrader API OPERATIONS, guards, `/login`, `/callback`, `/api/status`, `/api/accounts`)

**Interfaces:**
- Consumes: `SessionStore` da `lib/sessions.js` (Task 1), `ConnectionsRegistry` da `lib/connections.js` (Task 2).
- Produces (usate dai Task 5-6):
  - `const sessionStore = new SessionStore()` e `const connections = new ConnectionsRegistry(path.join(__dirname, 'data', 'connections.json'))` a livello di modulo.
  - `ensureConnection(session)` — 401 se sessione assente/senza token; WS + app auth + `session.accounts` popolati.
  - `getAccountsByToken(session)`, `accountAuth(session, ctidTraderAccountId)`, `refreshAccessToken(session)` — le versioni per-sessione delle attuali funzioni globali.
- Nota: in questo task `/api/balance`, `/api/positions`, `/api/history` si limitano a passare la sessione (guard di ownership nel Task 5).

- [ ] **Step 1: Sostituisci lo stato globale con sessioni + registro**

In `server.js`, nella sezione STATE, **elimina** le righe:

```js
let accessToken = null;
let refreshToken = null;
...
let accountsList = [];
```

e sostituiscile con (mantieni `wsConnection`, `isAppAuthorized`, `authorizedAccounts`):

```js
const { SessionStore } = require('./lib/sessions');
const { ConnectionsRegistry } = require('./lib/connections');

// Sessioni per-browser: ogni browser ha il proprio token cTrader in memoria.
const sessionStore = new SessionStore();
// Registro persistente: prima connessione di ogni account (data + baseline).
const connections = new ConnectionsRegistry(path.join(__dirname, 'data', 'connections.json'));

let wsConnection = null;
let isAppAuthorized = false;
let authorizedAccounts = new Set();
```

- [ ] **Step 2: Rendi per-sessione le operazioni che usavano il token globale**

Sostituisci `getAccountsByToken`, `accountAuth` e `refreshAccessToken` così (il WebSocket resta unico e condiviso: l'account auth porta con sé il token dell'utente giusto):

```js
async function getAccountsByToken(session) {
    const resp = await sendMessage(PayloadType.OA_GET_ACCOUNTS_BY_ACCESS_TOKEN_REQ, {
        accessToken: session.accessToken,
    });
    if (resp.payloadType === PayloadType.OA_GET_ACCOUNTS_BY_ACCESS_TOKEN_RES) {
        session.accounts = resp.payload.ctidTraderAccount || [];
        console.log(`[API] Found ${session.accounts.length} accounts (sid ${session.sid.slice(0, 8)}…)`);
    }
    return resp;
}

async function accountAuth(session, ctidTraderAccountId) {
    const resp = await sendMessage(PayloadType.OA_ACCOUNT_AUTH_REQ, {
        ctidTraderAccountId: ctidTraderAccountId,
        accessToken: session.accessToken,
    });
    if (resp.payloadType === PayloadType.OA_ACCOUNT_AUTH_RES) {
        authorizedAccounts.add(ctidTraderAccountId);
        console.log(`[API] Account ${ctidTraderAccountId} authorized`);
    }
    return resp;
}
```

In `refreshAccessToken`, cambia la firma in `refreshAccessToken(session)` e dentro: `if (!session.refreshToken) return reject(...)`, usa `session.refreshToken` nei params e assegna `session.accessToken = parsed.accessToken; session.refreshToken = parsed.refreshToken;` al posto delle variabili globali.

- [ ] **Step 3: Aggiorna `ensureConnection` alla firma per-sessione**

```js
async function ensureConnection(session) {
    if (!session || !session.accessToken) {
        throw apiError('Not authenticated. Please login first.', 401);
    }
    if (!wsConnection || wsConnection.readyState !== WebSocket.OPEN) {
        console.log('[WS] Not connected, reconnecting...');
        await connectWebSocket();
    }
    if (!isAppAuthorized) {
        await applicationAuth();
    }
    if (session.accounts.length === 0) {
        try {
            await getAccountsByToken(session);
        } catch (err) {
            console.error('[API] Could not refresh accounts list:', err.message);
        }
    }
}
```

`ensureAccountAuth` per ora cambia solo firma — `async function ensureAccountAuth(session, ctidTraderAccountId)` — con `await ensureConnection(session)` e `await accountAuth(session, ctidTraderAccountId)` all'interno (il guard di ownership arriva nel Task 5).

- [ ] **Step 4: Aggiorna `/login`, `/callback`, `/api/status`, `/api/accounts` e i call-site**

`handleLogin` — il cookie va impostato PRIMA del redirect a cTrader, così `/callback` ritrova la sessione:

```js
function handleLogin(req, res) {
    sessionStore.ensure(req, res);
    const params = new URLSearchParams({
        client_id: CONFIG.CLIENT_ID,
        redirect_uri: CONFIG.REDIRECT_URI,
        scope: 'trading',
        product: 'web',
    });
    res.redirect(`${CONFIG.AUTH_URL}?${params.toString()}`);
}
```

`/callback` — associa il token alla sessione del browser e **non riconnette il WebSocket se è già attivo** (riconnetterlo azzererebbe `authorizedAccounts` scollegando gli altri utenti):

```js
app.get('/callback', async (req, res) => {
    const code = req.query.code;
    if (!code) {
        return res.status(400).send('Missing authorization code');
    }
    const session = sessionStore.ensure(req, res);
    try {
        const tokenData = await exchangeCodeForToken(code);
        session.accessToken = tokenData.accessToken;
        session.refreshToken = tokenData.refreshToken;
        console.log('[AUTH] Token obtained successfully');

        if (!wsConnection || wsConnection.readyState !== WebSocket.OPEN) {
            await connectWebSocket();
        }
        if (!isAppAuthorized) {
            await applicationAuth();
        }
        await getAccountsByToken(session);
        res.redirect('/');
    } catch (err) {
        console.error('[AUTH] Error:', err.message);
        res.status(500).send(`Authentication failed: ${err.message}`);
    }
});
```

`/api/status` — riflette solo la sessione del richiedente:

```js
app.get('/api/status', (req, res) => {
    const session = sessionStore.get(req);
    const accounts = session ? session.accounts : [];
    res.json({
        authenticated: !!(session && session.accessToken),
        wsConnected: !!(wsConnection && wsConnection.readyState === WebSocket.OPEN),
        appAuthorized: isAppAuthorized,
        accountsCount: accounts.length,
        accounts: accounts.map(a => ({
            id: a.ctidTraderAccountId,
            broker: a.brokerTitleShort || a.brokerName || null,
            login: a.traderLogin != null ? a.traderLogin : null,
            isLive: !!a.isLive,
        })),
    });
});
```

`/api/accounts`:

```js
app.get('/api/accounts', async (req, res) => {
    try {
        const session = sessionStore.get(req);
        await ensureConnection(session);
        const resp = await getAccountsByToken(session);
        res.json({ accounts: resp.payload.ctidTraderAccount || [] });
    } catch (err) {
        res.status(err.status || 500).json({ error: err.message });
    }
});
```

In `/api/balance`, `/api/positions`, `/api/history`: aggiungi `const session = sessionStore.get(req);` dopo il parse di `accountId` e cambia la chiamata in `await ensureAccountAuth(session, accountId);`.

- [ ] **Step 5: Regressione test + avvio**

Run: `npm test` → Expected: PASS (11 test)
Run: `node -e "require('./server.js')"` per 2 secondi → Expected: banner di avvio senza eccezioni (poi Ctrl+C / kill).

- [ ] **Step 6: Verifica manuale multi-sessione (richiede login cTrader)**

1. `npm start`, apri `http://localhost:3000`, fai Login cTrader → Portfolio con i tuoi dati.
2. `curl -s http://localhost:3000/api/status` (senza cookie) → `"authenticated": false` e `accounts: []` anche se il browser è loggato. Prima della feature avrebbe mostrato i tuoi account: è il fix dell'isolamento.
3. Nel browser, `/api/status` → `authenticated: true` con i tuoi account.

- [ ] **Step 7: Commit**

```bash
rtk git add server.js
rtk git commit -m "feat: sessioni cTrader per-browser (token isolati, WebSocket condiviso)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Ownership guard + registrazione della connessione

**Files:**
- Modify: `server.js` (`ensureAccountAuth` + nuova `assertAccountOwnership`)

**Interfaces:**
- Consumes: `sessionStore`, `connections`, `ensureConnection(session)`, `accountAuth(session, id)`, `getTraderInfo(id)`, `loadSymbolNames(id)` (Task 4).
- Produces: `ensureAccountAuth(session, ctidTraderAccountId)` — dopo questa chiamata l'account è autorizzato sul WS **e** ha una voce in `connections.json`; lancia 401 (no sessione) o 403 (account non posseduto). Usata così dal Task 6.

- [ ] **Step 1: Implementa guard e registrazione**

In `server.js`, sostituisci `ensureAccountAuth` con:

```js
// L'account richiesto deve appartenere alla sessione del richiedente:
// con più utenti collegati, senza questo check un cliente potrebbe leggere
// i dati del conto di un altro passando un accountId altrui.
function assertAccountOwnership(session, ctidTraderAccountId) {
    const owned = session.accounts.some(
        a => Number(a.ctidTraderAccountId) === ctidTraderAccountId
    );
    if (!owned) {
        throw apiError('Account not accessible from this session', 403);
    }
}

async function ensureAccountAuth(session, ctidTraderAccountId) {
    await ensureConnection(session);
    assertAccountOwnership(session, ctidTraderAccountId);
    if (!authorizedAccounts.has(ctidTraderAccountId)) {
        await accountAuth(session, ctidTraderAccountId);
        // Dopo l'autorizzazione recupera i nomi simboli (degrada se fallisce)
        await loadSymbolNames(ctidTraderAccountId);
    }
    // Prima connessione di questo account al sito: registra data e baseline.
    // Ai login successivi la voce esiste già e non viene mai toccata.
    if (!connections.get(ctidTraderAccountId)) {
        const resp = await getTraderInfo(ctidTraderAccountId);
        const trader = resp.payload.trader || resp.payload;
        const divisor = Math.pow(10, trader.moneyDigits || 2);
        const entry = connections.ensure(ctidTraderAccountId, {
            connectedAt: new Date().toISOString(),
            baselineBalance: trader.balance / divisor,
        });
        console.log(`[CONNECTIONS] Account ${ctidTraderAccountId} connesso il ${entry.connectedAt} con baseline ${entry.baselineBalance}`);
    }
}
```

- [ ] **Step 2: Regressione test**

Run: `npm test`
Expected: PASS (11 test)

- [ ] **Step 3: Verifica manuale (richiede login cTrader)**

1. Se esiste, cancella `data/connections.json` (siamo in sviluppo: si rigenera).
2. `npm start`, login, apri il Portfolio → in console del server appare `[CONNECTIONS] Account … connesso il …`.
3. `data/connections.json` contiene la voce con `connectedAt` e `baselineBalance` uguale al balance mostrato.
4. Riavvia il server, rifai login → la voce NON cambia (stesso `connectedAt`).
5. `curl -s "http://localhost:3000/api/balance?accountId=1"` senza cookie → 401; con un accountId non tuo dal browser loggato → 403.

- [ ] **Step 4: Commit**

```bash
rtk git add server.js
rtk git commit -m "feat: ownership guard per sessione + registrazione prima connessione account

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: Endpoint `GET /api/performance`

**Files:**
- Modify: `server.js` (nuova funzione `collectClosingDeals` + endpoint, dopo `/api/history`)
- Modify: `README.md` (tabella endpoint + nota multi-utente)

**Interfaces:**
- Consumes: `ensureAccountAuth(session, id)` (Task 5), `connections` (Task 2/4), `getDealList(id, from, to, maxRows)` e `getTraderInfo(id)` esistenti, `buildPerformancePoints` / `computeGainPct` / `nextDealCursor` (Task 3).
- Produces: `GET /api/performance?accountId=…` → `{ connectedAt: string, baselineBalance: number, currentBalance: number, gainPct: number|null, points: [{t: number, balance: number}], historyError: string|null }`. Il frontend (Task 7) consuma esattamente questa shape.

- [ ] **Step 1: Implementa raccolta deal a blocchi + endpoint**

In cima a `server.js`, con gli altri require: `const { buildPerformancePoints, computeGainPct, nextDealCursor } = require('./lib/performance');`

Dopo l'endpoint `/api/history` aggiungi:

```js
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

// Tutti i deal di chiusura dal giorno della connessione a oggi, letti a
// blocchi di 7 giorni (limite del periodo di OA_DEAL_LIST_REQ) con
// paginazione hasMore dentro ogni blocco.
async function collectClosingDeals(ctidTraderAccountId, fromMs, toMs) {
    const collected = [];
    let cursor = fromMs;
    while (cursor < toMs) {
        const chunkEnd = Math.min(cursor + WEEK_MS, toMs);
        const resp = await getDealList(ctidTraderAccountId, cursor, chunkEnd, 1000);
        const deals = resp.payload.deal || [];
        for (const d of deals) {
            if (!d.closePositionDetail) continue;
            const digits = d.closePositionDetail.moneyDigits != null
                ? d.closePositionDetail.moneyDigits
                : (d.moneyDigits != null ? d.moneyDigits : 2);
            collected.push({
                t: Number(d.executionTimestamp),
                balance: d.closePositionDetail.balance / Math.pow(10, digits),
            });
        }
        const last = deals.length ? Number(deals[deals.length - 1].executionTimestamp) : NaN;
        cursor = nextDealCursor(
            { hasMore: !!resp.payload.hasMore, lastDealTimestamp: last },
            cursor,
            chunkEnd
        );
    }
    return collected;
}

// --- API: Performance dal giorno della connessione ---
app.get('/api/performance', async (req, res) => {
    try {
        const accountId = parseInt(req.query.accountId, 10);
        if (!accountId) {
            return res.status(400).json({ error: 'Missing accountId parameter' });
        }
        const session = sessionStore.get(req);
        await ensureAccountAuth(session, accountId);

        const entry = connections.get(accountId);
        const connectedAtMs = Date.parse(entry.connectedAt);
        const nowMs = Date.now();

        const traderResp = await getTraderInfo(accountId);
        const trader = traderResp.payload.trader || traderResp.payload;
        const currentBalance = trader.balance / Math.pow(10, trader.moneyDigits || 2);

        // Se lo storico fallisce la curva degrada ad assente, ma il KPI
        // (baseline -> attuale) resta calcolabile: niente 500 totale.
        let deals = [];
        let historyError = null;
        try {
            deals = await collectClosingDeals(accountId, connectedAtMs, nowMs);
        } catch (err) {
            historyError = err.message;
            console.error(`[API] Storico performance non disponibile per ${accountId}: ${err.message}`);
        }

        res.json({
            connectedAt: entry.connectedAt,
            baselineBalance: entry.baselineBalance,
            currentBalance,
            gainPct: computeGainPct(entry.baselineBalance, currentBalance),
            points: historyError ? [] : buildPerformancePoints({
                connectedAtMs,
                baselineBalance: entry.baselineBalance,
                deals,
                nowMs,
                currentBalance,
            }),
            historyError,
        });
    } catch (err) {
        res.status(err.status || 500).json({ error: err.message });
    }
});
```

- [ ] **Step 2: Aggiorna il README**

Nella tabella endpoint aggiungi la riga:

```markdown
| `GET /api/performance?accountId=…` | Curva balance e % di performance dal giorno della prima connessione dell'account |
```

Sotto la tabella aggiungi il paragrafo:

```markdown
## Multi-utente

Ogni browser ha la propria sessione (cookie `ametrades_sid`): più utenti possono
essere loggati contemporaneamente, ognuno vede solo i propri account. Alla prima
autorizzazione di un account il server registra data di connessione e balance di
partenza in `data/connections.json` (non committato): da lì parte il grafico
"Performance" del Portfolio. I token restano solo in memoria: al riavvio si
rifà il login, ma data e baseline della connessione sopravvivono.
```

- [ ] **Step 3: Regressione test**

Run: `npm test`
Expected: PASS (11 test)

- [ ] **Step 4: Verifica manuale (richiede login cTrader)**

1. `npm start`, login dal browser.
2. Dal browser: `fetch('/api/performance?accountId=<tuo id>').then(r => r.json()).then(console.log)` → oggetto con `connectedAt`, `baselineBalance`, `currentBalance`, `gainPct`, `points` (primo punto = baseline, ultimo = balance attuale, ordinati per `t` crescente).
3. `curl -s "http://localhost:3000/api/performance?accountId=<tuo id>"` senza cookie → 401.

- [ ] **Step 5: Commit**

```bash
rtk git add server.js README.md
rtk git commit -m "feat: endpoint /api/performance con curva balance dal giorno della connessione

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: Card Performance nel Portfolio (frontend)

**Files:**
- Modify: `public/auto-data.js` (fetch + card + grafico SVG + hover)
- Modify: `public/style.css` (stili `.perf-*` in fondo, prima della sezione Responsive)

**Interfaces:**
- Consumes: `GET /api/performance` (shape del Task 6); classi CSS esistenti `card`, `card-h`, `stat-tile`, `stat-k`, `stat-v`, `stat-sub`, `stat-unit`, `pf-empty`, pattern `pnlParts`.
- Produces: UI finale; nessun task successivo.

- [ ] **Step 1: Fetch della performance in `autoFetchAllData`**

In `public/auto-data.js`, dentro `autoFetchAllData`, sostituisci il blocco `Promise.all` e la chiamata a `showAllData` con:

```js
const [positions, history, performance] = await Promise.all([
    fetchJson(`/api/positions?accountId=${id}`).catch(e => ({ __error: e.message })),
    fetchJson(`/api/history?accountId=${id}&from=${from}&to=${to}&maxRows=100`).catch(e => ({ __error: e.message })),
    fetchJson(`/api/performance?accountId=${id}`).catch(e => ({ __error: e.message })),
]);

this.showAllData({ balance, positions, history, performance });
```

- [ ] **Step 2: Card + grafico SVG + hover**

Sempre in `auto-data.js`, aggiungi questi tre metodi alla classe (dopo `tag(text)`, prima di `showAllData`):

```js
// ---------- Card Performance (grafico dal giorno della connessione) ----------
perfCard(performance) {
    if (!performance || performance.__error) {
        return `
      <div class="card perf-card">
        <div class="card-h">Performance</div>
        <div class="pf-empty">Dati performance non disponibili${performance && performance.__error ? `: ${performance.__error}` : ''}.</div>
      </div>`;
    }
    const connDate = new Date(performance.connectedAt).toLocaleDateString('it-IT');
    const g = performance.gainPct;
    const gp = (typeof g === 'number' && isFinite(g))
        ? this.pnlParts(g)
        : { cls: 'na', arrow: '', text: 'N/A' };
    const points = Array.isArray(performance.points) ? performance.points : [];
    return `
      <div class="card perf-card">
        <div class="card-h">Performance dal ${connDate}</div>
        <div class="perf-kpis">
          <div class="stat-tile">
            <div class="stat-k">Dal giorno della connessione</div>
            <div class="stat-v ${gp.cls}">${gp.arrow ? `<span class="arrow" aria-hidden="true">${gp.arrow}</span> ` : ''}${gp.text}${gp.text !== 'N/A' ? '<span class="stat-unit">%</span>' : ''}</div>
            <div class="stat-sub">baseline ${this.fmtNum(performance.baselineBalance)} → attuale ${this.fmtNum(performance.currentBalance)}</div>
          </div>
        </div>
        ${points.length >= 2
            ? this.perfChart(points, performance.baselineBalance)
            : `<div class="pf-empty">${performance.historyError
                ? `Storico non disponibile: ${performance.historyError}`
                : 'La curva apparirà con i primi trade dal giorno della connessione.'}</div>`}
      </div>`;
}

// Grafico a linea del balance: SVG generato a mano, coerente col design system.
// Serie unica color brass (nessuna legenda: il titolo la nomina); baseline
// tratteggiata al balance di partenza; griglia recessiva; etichette dirette
// solo su primo/ultimo punto, mai su tutti (la tabella dei dati è la card
// "Trade chiusi").
perfChart(points, baseline) {
    const W = 640, H = 200, PAD = { t: 16, r: 12, b: 24, l: 56 };
    const iw = W - PAD.l - PAD.r, ih = H - PAD.t - PAD.b;
    const ts = points.map(p => p.t);
    const bs = points.map(p => p.balance).concat([baseline]);
    const t0 = Math.min(...ts), t1 = Math.max(...ts);
    let b0 = Math.min(...bs), b1 = Math.max(...bs);
    if (b1 - b0 < 1e-9) { b0 -= 1; b1 += 1; } // serie piatta: evita divisione per zero
    const margin = (b1 - b0) * 0.08;
    b0 -= margin; b1 += margin;
    const x = t => PAD.l + ((t - t0) / Math.max(1, t1 - t0)) * iw;
    const y = b => PAD.t + (1 - (b - b0) / (b1 - b0)) * ih;

    const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p.balance).toFixed(1)}`).join(' ');
    const area = `${line} L${x(t1).toFixed(1)},${(H - PAD.b).toFixed(1)} L${x(t0).toFixed(1)},${(H - PAD.b).toFixed(1)} Z`;

    const grid = [0, 0.5, 1].map(k => {
        const v = b0 + (b1 - b0) * k;
        const gy = y(v).toFixed(1);
        return `<line x1="${PAD.l}" y1="${gy}" x2="${W - PAD.r}" y2="${gy}" class="perf-grid"/>
            <text x="${PAD.l - 8}" y="${gy}" class="perf-tick" text-anchor="end" dominant-baseline="middle">${v.toFixed(0)}</text>`;
    }).join('');

    const first = points[0], last = points[points.length - 1];
    const fmtD = t => new Date(t).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' });

    return `
      <div class="perf-chart-wrap">
        <svg class="perf-chart" viewBox="0 0 ${W} ${H}" role="img"
             aria-label="Andamento del balance dal giorno della connessione: da ${this.fmtNum(first.balance)} a ${this.fmtNum(last.balance)}">
          ${grid}
          <line x1="${PAD.l}" y1="${y(baseline).toFixed(1)}" x2="${W - PAD.r}" y2="${y(baseline).toFixed(1)}" class="perf-baseline"/>
          <path d="${area}" class="perf-area"/>
          <path d="${line}" class="perf-line"/>
          <circle cx="${x(last.t).toFixed(1)}" cy="${y(last.balance).toFixed(1)}" r="3.5" class="perf-dot"/>
          <text x="${PAD.l}" y="${H - 6}" class="perf-tick">${fmtD(first.t)}</text>
          <text x="${W - PAD.r}" y="${H - 6}" class="perf-tick" text-anchor="end">${fmtD(last.t)}</text>
        </svg>
        <div class="perf-tooltip" hidden></div>
      </div>`;
}

// Tooltip al passaggio: punto più vicino sull'asse tempo. Il bersaglio è
// l'intera area del grafico, non il singolo punto (target ampio).
bindPerfHover(container) {
    const svg = container.querySelector('.perf-chart');
    const tip = container.querySelector('.perf-tooltip');
    const points = this.perfPoints;
    if (!svg || !tip || !Array.isArray(points) || points.length < 2) return;

    const W = 640, PAD_L = 56, PAD_R = 12;
    const t0 = points[0].t, t1 = points[points.length - 1].t;

    svg.addEventListener('pointermove', (e) => {
        const rect = svg.getBoundingClientRect();
        const frac = ((e.clientX - rect.left) / rect.width * W - PAD_L) / (W - PAD_L - PAD_R);
        const t = t0 + Math.max(0, Math.min(1, frac)) * (t1 - t0);
        let best = points[0];
        for (const p of points) {
            if (Math.abs(p.t - t) < Math.abs(best.t - t)) best = p;
        }
        tip.textContent = `${new Date(best.t).toLocaleDateString('it-IT')} · ${this.fmtNum(best.balance)}`;
        tip.hidden = false;
        tip.style.left = `${Math.max(0, Math.min(rect.width - 130, e.clientX - rect.left + 12))}px`;
        tip.style.top = '8px';
    });
    svg.addEventListener('pointerleave', () => { tip.hidden = true; });
}
```

- [ ] **Step 3: Inserisci la card nel render e aggancia l'hover**

In `showAllData`:

1. Cambia la firma in `showAllData({ balance, positions, history, performance })`.
2. Subito dopo `const balanceOk = balance && !balance.__error;` aggiungi:

```js
this.perfPoints = (performance && !performance.__error && Array.isArray(performance.points))
    ? performance.points : null;
```

3. Nel template, subito dopo la chiusura di `<div class="kpi-row">…</div>` e prima di `<div class="pf-cols">`, inserisci:

```js
${this.perfCard(performance)}
```

4. Come ultima riga del metodo, dopo l'assegnazione di `el.innerHTML`, aggiungi:

```js
this.bindPerfHover(el);
```

- [ ] **Step 4: Stili CSS**

In `public/style.css`, prima della sezione Responsive, aggiungi:

```css
/* ==================== PERFORMANCE CHART ==================== */
.perf-card { margin-top: 18px; }
.perf-kpis { margin-bottom: 14px; }
.perf-chart-wrap { position: relative; }
.perf-chart { display: block; width: 100%; height: auto; }
.perf-grid { stroke: var(--line-soft); stroke-width: 1; }
.perf-baseline { stroke: var(--faint); stroke-width: 1; stroke-dasharray: 4 4; }
.perf-line {
  fill: none; stroke: var(--brass); stroke-width: 2;
  stroke-linejoin: round; stroke-linecap: round;
}
.perf-area { fill: var(--brass-wash); stroke: none; }
.perf-dot { fill: var(--brass-hi); }
.perf-tick { fill: var(--muted); font-family: var(--font-mono); font-size: 10px; }
.perf-tooltip {
  position: absolute; pointer-events: none;
  background: rgba(var(--ink-rgb), 0.92);
  border: 1px solid var(--line); border-radius: 6px;
  color: var(--text); font-family: var(--font-mono); font-size: 12px;
  padding: 6px 10px; white-space: nowrap;
}
```

- [ ] **Step 5: Regressione test + verifica visiva (richiede login cTrader)**

1. Run: `npm test` → Expected: PASS (11 test).
2. `npm start`, login, apri il Portfolio: la card "Performance dal `<data>`" appare sotto i KPI con la % (freccia + segno) e la curva brass con baseline tratteggiata.
3. Muovi il mouse sul grafico → tooltip con data e balance del punto più vicino; esci → sparisce.
4. Restringi la finestra a ~375px: il grafico scala (viewBox) senza overflow orizzontale.
5. Conto senza trade dopo la connessione: la card mostra la % e il messaggio "La curva apparirà con i primi trade…" senza errori in console.

- [ ] **Step 6: Commit**

```bash
rtk git add public/auto-data.js public/style.css
rtk git commit -m "feat: card Performance con grafico SVG dal giorno della connessione

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```
