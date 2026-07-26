# ametrades

Sito "ametrades" (vanilla JS + Three.js via CDN) con backend Express integrato che si collega
alla **cTrader Open API** reale (OAuth + WebSocket JSON, porta 5036).

Un solo processo Node.js: Express serve i file statici in `public/` e le API cTrader sullo
stesso indirizzo (`http://localhost:3000`). Nessun CORS, nessun proxy, nessun database,
nessun bundler.

**Sola lettura**: il backend non espone alcun endpoint di trading (niente ordini, chiusure o modifiche).

## Prerequisiti

- Node.js 18 o superiore (con npm)
- Un'applicazione cTrader Open API registrata su [id.ctrader.com](https://id.ctrader.com)
  (sezione *Settings → Open API*), da cui ottenere Client ID e Client Secret
- Un account cTrader (demo o live)

## Configurazione (.env)

Crea un file `.env` nella root del progetto (non va mai committato: è già in `.gitignore`)
con queste chiavi:

```
CTRADER_CLIENT_ID=<il tuo Client ID>
CTRADER_CLIENT_SECRET=<il tuo Client Secret>
CTRADER_REDIRECT_URI=http://localhost:3000/callback
CTRADER_WS_URL=wss://demo.ctraderapi.com:5036
PORT=3000
```

**Importante**: il redirect URI `http://localhost:3000/callback` deve essere registrato
tra i "Redirect URIs" della tua applicazione cTrader su id.ctrader.com, altrimenti il
login OAuth viene rifiutato.

## Avvio

```
npm install
npm start
```

Poi apri [http://localhost:3000](http://localhost:3000) nel browser e clicca **Login cTrader**:
si apre la pagina di autorizzazione di cTrader; al termine vieni riportato al sito e la
sezione Portfolio mostra i dati dell'account (info conto, posizioni aperte, trade chiusi
degli ultimi 30 giorni e statistiche).

## Passare da demo a live

Nel `.env` cambia:

```
CTRADER_WS_URL=wss://live.ctraderapi.com:5036
```

e riavvia il server. Il default (se la chiave manca) è il server **demo**
`wss://demo.ctraderapi.com:5036`.

## Endpoint del backend

| Endpoint | Descrizione |
|---|---|
| `GET /login` (alias `GET /login-ctrader-oauth`) | Redirect alla pagina di autorizzazione cTrader |
| `GET /callback` | Callback OAuth: scambia il code con il token e torna a `/` |
| `GET /api/status` | Stato autenticazione + lista account di base |
| `GET /api/accounts` | Lista account completa |
| `GET /api/balance?accountId=…` | Info conto (balance, leva, broker, …) |
| `GET /api/positions?accountId=…` | Posizioni aperte e ordini pendenti (con `symbolName`) |
| `GET /api/history?accountId=…&from=…&to=…&maxRows=…` | Storico deal (con `symbolName`) |
| `GET /api/performance?accountId=…` | Serie del balance (fino a 6 mesi, in cache 2 minuti) con le viste 1 settimana / 1 mese / 3 mesi / 6 mesi / dalla connessione |

## Multi-utente

Ogni browser ha la propria sessione (cookie `ametrades_sid`): più utenti possono
essere loggati contemporaneamente, ognuno vede solo i propri account. Alla prima
autorizzazione di un account il server registra data di connessione e balance di
partenza in `data/connections.json` (non committato): da lì parte il grafico
"Performance" del Portfolio. I token restano solo in memoria: al riavvio si
rifà il login, ma data e baseline della connessione sopravvivono.

## Limiti noti

- **Equity e margin level non sono in tempo reale**: questo backend non sottoscrive gli
  eventi spot/margin, quindi il frontend li mostra come "N/A".
- **Il login OAuth va completato manualmente nel browser**: non è automatizzabile;
  al riavvio del server bisogna rifare il login (il token è tenuto solo in memoria).
- I nomi dei simboli vengono recuperati e messi in cache dopo l'autorizzazione
  dell'account; se la richiesta fallisce viene mostrato l'ID numerico del simbolo.
