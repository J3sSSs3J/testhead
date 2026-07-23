# Restyle ametrades — Design doc

Data: 2026-07-23
Modalità: self-directed (brainstorming condotto in autonomia su richiesta esplicita del committente).

## 1. Obiettivo

Restyle completo — grafico **e** di contenuti — del sito ametrades, mantenendo intatte
funzionalità e backend cTrader (sola lettura). Nuova identità visiva distintiva e
intenzionale (non un template), testi in italiano professionale coerenti col
posizionamento, CSS consolidato, codice morto eliminato, scena Three.js valorizzata.

## 2. Cos'è ametrades (posizionamento)

Sito personale di un **trader-sviluppatore**. Il valore centrale è la **trasparenza**:
mostra risultati di trading *reali e verificabili in tempo reale*, letti live da cTrader
in **sola lettura** (nessuno screenshot, nessun numero promesso, nessun cherry-picking).
Affianca la persona ("Chi sono") e i progetti fintech che costruisce ("Progetti").

- Differenziatore: dati live da conto reale, non marketing.
- Target: chi valuta serietà/performance del trader e ne apprezza il lato tecnico.

## 3. Vincoli (non negoziabili)

- Vanilla JS + Three.js via CDN. Nessun framework, bundler o nuova dipendenza npm.
- `server.js`, `.env` e la logica API cTrader restano in sola lettura: non si toccano.
- Si mantiene l'architettura a viewport fisso con overlay di sezione + coreografia del
  modello 3D che si sposta per ogni sezione.
- Repo git inizializzato con commit "pre-restyle" per la reversibilità (fatto).

## 4. Direzione visiva — "Strumento di precisione" (financial noir)

Scelta tra: (A) rework del neon viola — scartata, troppo template; (B) financial noir —
**scelta**; (C) editorial chiaro — scartata, incoerente col modello 3D scuro e lo starfield.

- **Base**: near-black raffinato con leggerissima tinta fredda; il modello 3D e lo
  starfield restano i protagonisti.
- **Accento signature**: un unico oro/ambra caldo (premium, mercati, fiducia), usato
  con parsimonia (linee sottili, dettagli, micro-accenti), non a grandi glow.
- **Semantica P/L**: verde = profitto, rosso = perdita, riservati **solo** ai numeri di
  performance — mai usati come decorazione, così non competono con l'accento.
- **Tipografia**: un display grotesque con carattere per i titoli + un grotesque pulito
  per il corpo + un **monospace a cifre tabellari** per tutti i numeri/dati (essenziale
  per un sito di trading). Font via CDN (Google Fonts).
- **Micro-interazioni**: sobrie e performanti. Niente glitch, niente pioggia di
  particelle, niente mouse-glow che ricrea nodi DOM ad ogni movimento.
- Palette e scala tipografica definite in dettaglio con la skill `frontend-design`;
  la sezione dati con la skill `dataviz`.

## 5. Architettura dei contenuti

Quattro sezioni navigabili + footer persistente, ognuna con una posa dedicata del
modello 3D (rimossa la posa "login" morta):

1. **Home / Hero** — modello centrale; headline con proposta di valore, sottotitolo,
   due CTA (Vedi il portfolio / Login cTrader). Micro-hint di navigazione.
2. **Chi sono** — modello a destra, testo a sinistra; bio credibile del trader-sviluppatore
   + competenze.
3. **Progetti** — modello a sinistra, testo/carte a destra; progetti concreti con
   descrizioni reali (integrazione cTrader, dashboard live, analytics, strumenti).
4. **Portfolio** — dati live cTrader (sola lettura) iniettati da `auto-data.js`:
   info conto, posizioni aperte, trade chiusi 30gg, statistiche. Ridisegnato come
   dashboard coerente con la skill `dataviz` (stat tile, KPI, tabelle a cifre mono).
5. **Footer** — barra persistente: brand, anno, tagline, contatti/nota "sola lettura".

## 6. Interventi sul codice (frontend soltanto)

- `index.html` — nuova struttura (hero con contenuto, nav a 4 voci + login, chi-sono,
  progetti, contenitore portfolio, footer), font via CDN, `<title>`/meta description
  aggiornati, `alt`/`aria` corretti.
- `style.css` — **unico** foglio di stile, riscritto con design token in `:root`;
  include gli stili della dashboard dati (prima iniettati da JS).
- `force-style.css` — **eliminato** (hack "cache buster" duplicato); rimosso il `<link>`.
- `main.js` — rimosso tutto il codice morto (sistema login/register/Chart.js `mainInit`,
  `loadUserDashboard`, `updateChart`, che referenzia DOM inesistenti e crea un **secondo**
  renderer Three.js duplicato). Resta e viene rifinita la scena 3D; aggiunta la posa
  "progetti"; cablati hero CTA e nav; rim light caldo coerente con l'accento.
- `effects.js`, `futuristic-effects.js` — **eliminati** (garish + perf-killer: 50 particelle,
  esagoni, data-stream, glitch, mouse-glow che ricrea nodi DOM su `mousemove`).
- `stars.js` — riscritto: **un solo** starfield performante (layer con box-shadow,
  twinkle CSS, parallax a livello container e throttled via rAF).
- `auto-data.js` — logica di fetch (`/api/status|accounts|balance|positions|history`)
  **preservata**; riscritti i template di markup e rimossa l'iniezione di stile (gli
  stili passano in `style.css`, classi nuove coerenti col design system).

## 7. Funzionalità da preservare (verifica a fine lavoro)

- Login cTrader OAuth (`/login-ctrader-oauth`).
- Caricamento dati portfolio: info conto, posizioni aperte, trade chiusi, statistiche.
- Aggiornamenti via `auto-data.js` (pulsante "Aggiorna", selettore account multiplo).

## 8. Criteri di successo

- Identità visiva distintiva e coerente su tutto il sito.
- Testi in italiano professionale, nessun segnaposto.
- Funzionalità cTrader intatte; console browser senza errori.
- Responsive mobile/tablet/desktop.
- CSS consolidato in un file; codice morto rimosso; performance migliorata.
- Screenshot desktop e mobile a conferma; commit finale descrittivo.
