# Scroll = cambio sezione, testa legata alla sezione

**Data:** 2026-07-25 · **Stato:** approvato dall'utente

## Obiettivo

Navigare il sito con la rotella/swipe: ogni gesto cambia sezione e la testa 3D
ruota verso la posa di quella sezione e lì resta (niente rotazione continua).

## Contesto

Il sito è a viewport fisso: i `.panel` sono overlay `position: fixed` aperti con
`is-open`; non esiste scroll di pagina. `AnimationStateManager` in
`public/main.js` ha già una posa (posizione, rotazione, zoom camera) per ognuna
delle 4 sezioni; sopra la rotazione di posa viene però sommato uno spin continuo
(`idle` in `setupAnimationLoop`) che va eliminato.

## Comportamento

1. **Ordine sezioni:** `home → about → projects → portfolio`. Wheel giù /
   swipe su / PgDn·↓ = sezione successiva; direzione opposta = precedente.
   Estremi bloccati (nessun wrap-around).
2. **Scroll interno rispettato:** se il pannello attivo (`.panel.is-open`) può
   ancora scorrere nella direzione del gesto, il gesto scorre il contenuto; il
   cambio sezione scatta solo a inizio/fine contenuto. Il Portfolio resta
   quindi leggibile per intero.
3. **Un gesto = una sezione:** cooldown ~900 ms + soglia sul delta per
   assorbire l'inerzia del trackpad; soglia ~50 px per lo swipe touch.
4. **Testa:** rimosso lo spin continuo. La testa fa il lerp verso la posa della
   sezione e, arrivata, oscilla appena (±~3.5°, sinusoide lenta). Con
   `prefers-reduced-motion: reduce` l'oscillazione è disattivata.
5. **Invariato:** click sul menu, brand e CTA continuano a funzionare tramite
   la stessa `activate()`.

## Implementazione

Solo `public/main.js` (nuova funzione `setupScrollNavigation(activate, state)`
+ modifica del loop di rendering) e bump della query `?v=` di `main.js` in
`index.html` per il cache busting. Nessuna modifica a HTML/CSS dei pannelli.

## Fuori scope

Scroll-snap CSS / ristrutturazione della pagina in scroll reale; indicatori di
sezione (pallini); wrap-around.
