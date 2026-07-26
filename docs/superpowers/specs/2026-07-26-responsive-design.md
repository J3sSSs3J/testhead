# Responsive completo — design

Data: 2026-07-26
Stato: implementato

## Obiettivo

Rendere il sito pienamente responsive: mobile portrait (320–460px), phablet
(460–680px), tablet (680–900px), landscape basso (altezza < 520px) e desktop,
senza cambiare il design system né la struttura del markup.

## Problemi rilevati

1. **Padding azzerato su mobile (bug).** A ≤680px `--nav-h: auto` rende
   `calc(var(--nav-h) + 24px)` invalido at computed-value time: l'intera
   proprietà `padding` di `.hero-content` e `.panel` decade al valore iniziale
   (0). Le patch `padding-top: 118px/128px` coprivano solo il lato top: il
   padding orizzontale restava 0 e il contenuto toccava i bordi dello schermo.
2. **Nav mobile ad altezza imprevedibile.** L'altezza dipendeva dal wrapping
   dei link; sotto i 460px poteva salire a tre righe scavalcando il contenuto.
3. **Scena 3D non adattiva.** Le pose del modello (offset X ±1.7 / 2.6, camera
   Z fissa) sono calibrate su 16:9. In portrait (aspect ~0.5) la semi-larghezza
   visibile è ~0.72 unità: la testa esce completamente dal quadro in Chi
   sono/Progetti/Portfolio ed è tagliata in Home.
4. **100vh su mobile** include la barra URL: hero più alta del viewport reale.
5. **Landscape basso** (< 520px di altezza): la hero con `space-between`
   accavalla titolo e CTA senza possibilità di scorrere.

## Approcci considerati

- **A. Hamburger menu su mobile** — richiede markup + JS nuovi e uno stato
  aperto/chiuso; scartato (YAGNI: 4 voci stanno su una riga).
- **B. Nav misurata via JS** (`--nav-h` scritto da JS con ResizeObserver) —
  robusto ma accoppia layout CSS e JS; scartato.
- **C. Nav mobile a due righe deterministiche in solo CSS** (scelto):
  `display: contents` su `.nav-links` + item di rottura riga (`.nav::after`
  con `width: 100%` e `order` intermedio). Riga 1: brand + login/stato.
  Riga 2: le 4 voci di sezione distribuite con `flex: 1 1 0`. L'altezza torna
  nota → `--nav-h` resta un numero e tutti i `calc()` esistenti tornano validi
  (fix del problema 1 senza patch hardcoded).

## Design

### CSS (`public/style.css`, solo sezione Responsive + un @supports)

- `@supports (height: 100dvh)`: `body` e `.hero` passano a `min-height: 100dvh`.
- ≤680px: `--nav-h: 98px` (numero, non `auto`); nav a due righe come sopra;
  rimossi gli override hardcoded di padding su hero e pannelli (tornano ai
  `calc()` di base). Hero impilata dall'alto e scorrevole (`overflow-y: auto`):
  sugli schermi più bassi (es. 320×568) le CTA finirebbero sotto il footer
  irraggiungibili. Velo scuro (`rgba(--ink-rgb, .45)`) anche su
  `.panel-left`/`.panel-right`: sui viewport stretti la testa 3D sta dietro al
  testo. Underline delle voci nav centrata (26px) invece che a tutta larghezza.
- ≤460px: padding ridotti di card, stat-tile e CTA; resto invariato.
- `@media (max-height: 520px)`: la hero passa a colonna scorrevole
  (`overflow-y: auto`, titolo in `vh`) invece di accavallarsi.

### Scena 3D (`public/main.js`)

Pose risolte in funzione dell'aspect al momento della transizione, con 16:9
come aspect di progetto (`DESIGN_ASPECT`):

- `zoomOut = sqrt(max(1, DESIGN_ASPECT / aspect))` → sotto il 16:9 la camera
  arretra (radice: metà compromesso tra inquadratura orizzontale e verticale).
- `cameraZ' = cameraZ × zoomOut`; `x' = x × (cameraZ' × aspect) /
  (cameraZ × DESIGN_ASPECT)` → la testa mantiene la stessa posizione
  *relativa* nel quadro su qualsiasi schermo (a 16:9 i fattori valgono 1:
  desktop invariato).
- Su resize (debounce 150ms) la posa della sezione corrente viene ricalcolata
  e raggiunta con la transizione standard (rotazione schermo inclusa).

### Cache busting (`public/index.html`)

`style.css?v=8`, `main.js?v=9` (convenzione del repo).

## Fuori scope

Hamburger menu, safe-area/notch (`viewport-fit=cover`), modifiche a
`stars.js` (già responsive: ricostruisce su resize) e ad `auto-data.js`
(markup già fluido, stilato dal CSS).

## Test

Nessuna infrastruttura di test nel repo. Verifica: `node --check` su main.js,
screenshot headless (Edge/Chrome) a 320/375/768/1440 e in landscape 740×360.
