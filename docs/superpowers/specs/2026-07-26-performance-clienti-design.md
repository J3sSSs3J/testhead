# Grafico performance per conti connessi (clienti) — design

Data: 2026-07-26
Stato: approvato

## Obiettivo

Un cliente crea il proprio conto cTrader e lo "connette" al sito facendo il
login OAuth cTrader su ametrades. Dal giorno della connessione parte un grafico
di come sta performando il suo conto: curva del balance + percentuale di
guadagno/perdita cumulata rispetto al giorno della connessione. Ogni cliente
vede solo il proprio conto; nessuna vista admin aggregata.

## Requisiti

1. La "connessione" è il primo login OAuth del cliente sul sito con
   autorizzazione in sola lettura del suo conto.
2. La data di connessione e il balance di partenza (baseline) sono registrati
   una sola volta e sopravvivono a riavvii del server e a nuovi login.
3. Il grafico mostra l'andamento del balance dal giorno della connessione e la
   performance percentuale cumulata rispetto alla baseline.
4. Più utenti (tu + clienti) devono poter essere collegati al sito
   contemporaneamente da browser diversi, ognuno vedendo solo i propri conti.

## Vincolo architetturale rilevato

Oggi `server.js` tiene **un solo token globale** (`accessToken` a livello di
modulo): il login di un cliente scalzerebbe quello del proprietario e
`/api/status` mostrerebbe a chiunque i dati dell'ultimo loggato. La feature
richiede sessioni per browser.

## Approcci considerati

- **A. Sessioni per-browser + file JSON + curva ricostruita dallo storico**
  (scelto): cookie di sessione HttpOnly, token cTrader per sessione in memoria
  (come oggi, ma per utente), file `data/connections.json` che persiste data di
  connessione e baseline per account, curva ricostruita dai trade chiusi.
  Niente database, coerente con l'architettura attuale.
- **B. Refresh token su disco + snapshot giornalieri del balance** — curva più
  fedele e niente re-login al riavvio, ma token in chiaro su disco e uno
  scheduler in più; scartato (complessità e rischio non necessari).
- **C. Solo frontend (localStorage)** — la data di connessione si perde
  cambiando browser o device; scartato (non soddisfa il requisito 2).

## Design

### Sessioni multi-utente (`server.js`)

- Cookie `ametrades_sid` (HttpOnly, SameSite=Lax), generato con
  `crypto.randomBytes` al primo `/login` e riusato nei successivi.
- Map in memoria `sessions: sid → { accessToken, refreshToken, accounts[] }`.
  Spariscono le variabili globali `accessToken` / `refreshToken` /
  `accountsList`.
- `/callback` associa il token ottenuto alla sessione del browser che ha
  avviato il flusso e popola i suoi `accounts` con
  `OA_GET_ACCOUNTS_BY_ACCESS_TOKEN`.
- Il WebSocket verso cTrader resta **unico** (una sola application auth):
  l'account auth (`OA_ACCOUNT_AUTH_REQ`) accetta un token diverso per ogni
  account, quindi `ensureAccountAuth` riceve la sessione e usa il token giusto.
  `authorizedAccounts` resta un Set di accountId sul WS condiviso.
- `/api/status` diventa per-sessione: `authenticated` e `accounts` riflettono
  solo la sessione del richiedente.
- **Autorizzazione**: ogni endpoint con `accountId` verifica che l'account
  appartenga a `session.accounts`; altrimenti 403. Indispensabile ora che il
  server serve più utenti.

### Registro connessioni (`data/connections.json`)

- File JSON persistente, in `data/` (aggiunta a `.gitignore`):
  `{ "<accountId>": { "connectedAt": ISO, "baselineBalance": number } }`.
- Scritto alla **prima** autorizzazione dell'account: subito dopo l'account
  auth il server legge il balance corrente (`OA_TRADER_REQ`) e salva data e
  baseline. Ai login successivi la voce esiste già e **non viene mai toccata**:
  il grafico riparte sempre dal giorno originale.
- Scrittura sincrona su file (poche voci, un solo processo): niente DB.

### Endpoint `GET /api/performance?accountId=…`

- Guard: sessione autenticata + account posseduto (come sopra), poi
  `ensureAccountAuth` (che garantisce l'esistenza della voce in
  `connections.json`).
- Recupera lo storico deal da `connectedAt` a oggi **a blocchi di 7 giorni**
  (limite del periodo di `OA_DEAL_LIST_REQ`), gestendo `hasMore` per blocco.
- Risposta:
  - `connectedAt`, `baselineBalance`
  - `points`: `[{ t, balance }]` — primo punto la baseline a `connectedAt`,
    un punto per ogni trade chiuso (`closePositionDetail.balance` = balance
    dopo la chiusura), ultimo punto il balance attuale a "adesso"
  - `currentBalance`, `gainPct = (currentBalance − baselineBalance) /
    baselineBalance × 100`; se `baselineBalance` è 0 (conto connesso prima del
    primo deposito) `gainPct` è `null` e il frontend mostra "N/A"
- Errori: stesso pattern degli altri endpoint (status + `{ error }`); il
  frontend degrada mostrando l'avviso nella card.

### Frontend (`public/auto-data.js`, `public/style.css`)

- `autoFetchAllData` chiama anche `/api/performance` (dopo `/api/balance`,
  in parallelo con posizioni e storico).
- Nuova card nel Portfolio: **"Performance dal `<data connessione>`"** con:
  - grafico a linea del balance in **SVG generato a mano** (niente librerie,
    coerente con il design system: stessi colori/tipografia delle card);
  - KPI della performance % cumulata con freccia ▲/▼ e segno, stesso pattern
    accessibile di `pnlParts` (mai solo colore).
- La card appare per chiunque sia loggato in quel browser: il cliente vede il
  suo conto, il proprietario il proprio. Con più conti sotto lo stesso login
  vale il selettore account già esistente.

## Error handling

- Sessione assente/scaduta → 401 come oggi (`Not authenticated`).
- `accountId` non posseduto dalla sessione → 403.
- Storico non recuperabile → la card mostra l'avviso e il KPI resta
  calcolabile da baseline + balance attuale (curva assente).
- File `connections.json` corrotto/illeggibile → log e ripartenza con registro
  vuoto in memoria (le voci si rigenerano al login successivo; la data
  originale in quel caso è persa e se ne accetta il rischio).

## Testing

Verifica manuale (nessuna infrastruttura di test nel progetto):

1. Login dal browser A (proprietario): Portfolio + card Performance visibili.
2. Login dal browser B (cliente, altro profilo): vede **solo** i suoi conti;
   una richiesta a `/api/balance` con l'accountId del proprietario → 403.
3. Riavvio del server: entrambi rifanno login, `connectedAt` e baseline
   restano quelli del primo giorno (file JSON intatto).
4. Conto con trade chiusi dopo la connessione: la curva mostra
   baseline → punti per trade → balance attuale; `gainPct` coerente.

## Limiti dichiarati

- Tra un trade chiuso e l'altro la curva è piatta; depositi/prelievi compaiono
  solo al primo trade chiuso successivo.
- I token restano in memoria: al riavvio del server ogni utente rifà il login
  (comportamento attuale, invariato).
- Equity e margin level restano "N/A" (invariato).

## Fuori scope

- Vista admin con i grafici di tutti i clienti.
- Copy trading / replica degli ordini (il sito resta in sola lettura).
- Registrazione clienti separata dal login cTrader.
