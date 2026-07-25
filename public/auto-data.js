// ==================== RECUPERO AUTOMATICO DATI ACCOUNT ====================
// Parla con il backend Express locale (stesso server che serve il sito):
//   GET /api/status, /api/balance, /api/positions, /api/history
// Sola lettura: nessuna operazione di trading.
// Il rendering è ridisegnato sul design system del sito (classi in style.css);
// la logica di fetch è invariata.
class AutoAccountData {
  constructor() {
    this.accounts = [];
    this.selectedAccountId = null;
  }

  mount() {
    return document.getElementById('portfolio-mount') || document.getElementById('content-portfolio');
  }

  // Feedback visivo di autenticazione: a login avvenuto nasconde i pulsanti
  // "Login cTrader" (nav + hero) e mostra l'indicatore "Connesso".
  updateAuthUI(connected) {
    document.querySelectorAll('.js-login-btn').forEach((el) => { el.hidden = !!connected; });
    document.querySelectorAll('.js-login-status').forEach((el) => { el.hidden = !connected; });
  }

  async initialize() {
    try {
      const res = await fetch('/api/status');
      const status = await res.json();

      this.updateAuthUI(!!status.authenticated);

      if (!status.authenticated) {
        this.showLoginButton();
        return;
      }

      this.accounts = status.accounts || [];

      // Fallback: se lo status non ha account, prova /api/accounts
      if (this.accounts.length === 0) {
        try {
          const r = await fetch('/api/accounts');
          const d = await r.json();
          if (r.ok) {
            this.accounts = (d.accounts || []).map(a => ({
              id: a.ctidTraderAccountId,
              broker: a.brokerTitleShort || a.brokerName || null,
              login: a.traderLogin != null ? a.traderLogin : null,
              isLive: !!a.isLive,
            }));
          }
        } catch (e) {
          console.error('Errore /api/accounts:', e);
        }
      }

      if (this.accounts.length === 0) {
        this.showError('Nessun account cTrader collegato a questo accesso.');
        return;
      }

      if (this.selectedAccountId === null ||
          !this.accounts.some(a => a.id === this.selectedAccountId)) {
        this.selectedAccountId = this.accounts[0].id;
      }

      await this.autoFetchAllData();
    } catch (error) {
      console.error('Errore inizializzazione:', error);
      this.showError('Impossibile contattare il server locale.');
    }
  }

  // Recupera in parallelo balance, posizioni e storico (ultimi 30 giorni)
  async autoFetchAllData() {
    const id = this.selectedAccountId;
    const to = Date.now();
    const from = to - 30 * 24 * 60 * 60 * 1000;

    const fetchJson = async (url) => {
      const res = await fetch(url);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Errore ${res.status}`);
      return data;
    };

    // Prima UNA sola richiesta: fa autorizzare l'account al backend una volta.
    // Evita la race quando 3 chiamate parallele arrivano su un account non ancora
    // autorizzato (il backend risponderebbe ALREADY_LOGGED_IN alle richieste extra).
    const balance = await fetchJson(`/api/balance?accountId=${id}`).catch(e => ({ __error: e.message }));
    const [positions, history] = await Promise.all([
      fetchJson(`/api/positions?accountId=${id}`).catch(e => ({ __error: e.message })),
      fetchJson(`/api/history?accountId=${id}&from=${from}&to=${to}&maxRows=100`).catch(e => ({ __error: e.message })),
    ]);

    this.showAllData({ balance, positions, history });
  }

  // Refresh dati (usato dal pulsante)
  async refreshAllData() {
    await this.initialize();
  }

  async selectAccount(id) {
    this.selectedAccountId = parseInt(id, 10);
    await this.autoFetchAllData();
  }

  // ---------- Helpers di formattazione ----------
  fmtNum(v, digits = 2) {
    return (typeof v === 'number' && isFinite(v)) ? v.toFixed(digits) : 'N/A';
  }

  fmtDate(iso) {
    if (!iso) return 'N/A';
    const d = new Date(iso);
    return isNaN(d) ? 'N/A' : d.toLocaleString('it-IT');
  }

  // Timestamp cTrader in millisecondi (spesso serializzati come stringa dal
  // JSON protobuf): vanno convertiti a numero prima di new Date().
  fmtTs(ts) {
    if (ts == null || ts === '') return 'N/A';
    const d = new Date(Number(ts));
    return isNaN(d) ? 'N/A' : d.toLocaleString('it-IT');
  }

  symbolLabel(item) {
    return item.symbolName || (item.symbolId != null ? `#${item.symbolId}` : 'N/A');
  }

  closedDeals(history) {
    if (!history || history.__error || !Array.isArray(history.deals)) return [];
    return history.deals.filter(d => d.closePositionDetail);
  }

  getTotalProfit(deals) {
    return deals.reduce((sum, d) => sum + (d.closePositionDetail.grossProfit || 0), 0);
  }

  getWinRate(deals) {
    if (deals.length === 0) return '0.0';
    const wins = deals.filter(d => (d.closePositionDetail.grossProfit || 0) > 0).length;
    return ((wins / deals.length) * 100).toFixed(1);
  }

  getAverageProfit(deals) {
    if (deals.length === 0) return 0;
    return this.getTotalProfit(deals) / deals.length;
  }

  // ---------- Helpers di rendering ----------
  // P/L sempre con segno + freccia: l'identità profitto/perdita non è mai affidata
  // al solo colore (accessibilità CVD).
  pnlParts(v) {
    if (typeof v !== 'number' || !isFinite(v)) return { cls: 'na', arrow: '', text: 'N/A' };
    const up = v >= 0;
    return { cls: up ? 'up' : 'down', arrow: up ? '▲' : '▼', text: (up ? '+' : '−') + Math.abs(v).toFixed(2) };
  }

  pnlChip(v) {
    const p = this.pnlParts(v);
    return `<span class="pnl ${p.cls}">${p.arrow ? `<span class="arrow" aria-hidden="true">${p.arrow}</span>` : ''}${p.text}</span>`;
  }

  sideTag(side) {
    const s = (side || '').toUpperCase();
    const arrow = s === 'BUY' ? '▲' : (s === 'SELL' ? '▼' : '·');
    return `<span class="side-tag"><span aria-hidden="true">${arrow}</span>${s || 'N/A'}</span>`;
  }

  // Tag neutro (stesso stile di sideTag) per tipo/stato di un ordine pendente.
  tag(text) {
    return `<span class="side-tag">${text || 'N/A'}</span>`;
  }

  // ---------- Rendering principale ----------
  showAllData({ balance, positions, history }) {
    const el = this.mount();
    if (!el) return;

    const openPositions = (positions && !positions.__error && Array.isArray(positions.positions))
      ? positions.positions : [];
    // Gli ordini pendenti (limit/stop non ancora eseguiti) arrivano da /api/positions
    // in un array separato: non sono posizioni aperte e vanno mostrati a parte,
    // altrimenti un ordine appena piazzato risulta invisibile nel Portfolio.
    const pendingOrders = (positions && !positions.__error && Array.isArray(positions.orders))
      ? positions.orders : [];
    const deals = this.closedDeals(history);
    const balanceOk = balance && !balance.__error;

    const errors = [];
    if (balance && balance.__error) errors.push(`Info conto: ${balance.__error}`);
    if (positions && positions.__error) errors.push(`Posizioni: ${positions.__error}`);
    if (history && history.__error) errors.push(`Storico: ${history.__error}`);

    const totalProfit = this.getTotalProfit(deals);
    const avgProfit = this.getAverageProfit(deals);
    const winRate = this.getWinRate(deals);
    const pTotal = this.pnlParts(totalProfit);

    const accountSelector = this.accounts.length > 1 ? `
      <div class="pf-select">
        <label for="account-select">Account</label>
        <select id="account-select" onchange="autoData.selectAccount(this.value)">
          ${this.accounts.map(a => `
            <option value="${a.id}" ${a.id === this.selectedAccountId ? 'selected' : ''}>
              ${a.broker || 'Broker'} · ${a.login != null ? a.login : a.id} ${a.isLive ? '(LIVE)' : '(DEMO)'}
            </option>`).join('')}
        </select>
      </div>` : '';

    el.innerHTML = `
      <div class="pf">
        <div class="pf-head">
          <div>
            <p class="eyebrow"><span class="eyebrow-index">04</span> Portfolio</p>
            <h2 class="panel-title">Il conto, in diretta.</h2>
          </div>
          <span class="pf-status"><span class="dot"></span>Dati live · aggiornato</span>
        </div>

        ${accountSelector}

        ${errors.length ? `
        <div class="pf-alert">
          <span class="k">Avvisi</span>
          ${errors.map(e => `<div>${e}</div>`).join('')}
        </div>` : ''}

        <!-- KPI -->
        <div class="kpi-row">
          <div class="stat-tile">
            <div class="stat-k">Balance</div>
            <div class="stat-v ${balanceOk ? '' : 'na'}">${balanceOk ? this.fmtNum(balance.balance) : 'N/A'}</div>
          </div>
          <div class="stat-tile">
            <div class="stat-k">P/L · 30 giorni</div>
            <div class="stat-v ${pTotal.cls}">${pTotal.arrow ? `<span class="arrow" aria-hidden="true">${pTotal.arrow}</span> ` : ''}${pTotal.text}</div>
            <div class="stat-sub">media ${this.pnlParts(avgProfit).text} / trade</div>
          </div>
          <div class="stat-tile">
            <div class="stat-k">Win rate</div>
            <div class="stat-v">${winRate}<span class="stat-unit">%</span></div>
            <div class="meter"><span style="width:${Math.max(0, Math.min(100, parseFloat(winRate)))}%"></span></div>
          </div>
          <div class="stat-tile">
            <div class="stat-k">Trade chiusi · 30gg</div>
            <div class="stat-v">${deals.length}</div>
          </div>
        </div>

        <div class="pf-cols">
          <!-- Info conto -->
          <div class="card">
            <div class="card-h">Informazioni conto</div>
            <div class="kv-grid">
              <div class="kv"><span class="k">Account ID</span><span class="v">${balanceOk ? (balance.ctidTraderAccountId ?? this.selectedAccountId) : this.selectedAccountId}</span></div>
              <div class="kv"><span class="k">Broker</span><span class="v ${balanceOk && balance.brokerName ? '' : 'na'}">${balanceOk ? (balance.brokerName || 'N/A') : 'N/A'}</span></div>
              <div class="kv"><span class="k">Login</span><span class="v ${balanceOk && balance.traderLogin != null ? '' : 'na'}">${balanceOk ? (balance.traderLogin ?? 'N/A') : 'N/A'}</span></div>
              <div class="kv"><span class="k">Tipo conto</span><span class="v ${balanceOk && balance.accountType ? '' : 'na'}">${balanceOk ? (balance.accountType || 'N/A') : 'N/A'}</span></div>
              <div class="kv"><span class="k">Leva</span><span class="v ${balanceOk && balance.leverage ? '' : 'na'}">${balanceOk ? (balance.leverage || 'N/A') : 'N/A'}</span></div>
              <div class="kv"><span class="k">Balance</span><span class="v accent">${balanceOk ? this.fmtNum(balance.balance) : 'N/A'}</span></div>
              <div class="kv"><span class="k">Equity</span><span class="v na" title="Non in tempo reale con questo backend">N/A</span></div>
              <div class="kv"><span class="k">Margin level</span><span class="v na" title="Non in tempo reale con questo backend">N/A</span></div>
            </div>
          </div>

          <!-- Posizioni aperte -->
          <div class="card">
            <div class="card-h">Posizioni aperte <span class="count">(${openPositions.length})</span></div>
            <div class="row-list scroll-cap">
              ${openPositions.length > 0 ? openPositions.map(pos => `
                <div class="row-item">
                  <div class="row-top">
                    <span class="sym">${this.symbolLabel(pos)}</span>
                    ${this.sideTag(pos.tradeSide)}
                  </div>
                  <div class="row-meta">
                    <span>Volume <b>${pos.volume ?? 'N/A'}</b></span>
                    <span>Apertura <b>${pos.price ?? 'N/A'}</b></span>
                    <span>SL <b>${pos.stopLoss ?? 'N/A'}</b></span>
                    <span>TP <b>${pos.takeProfit ?? 'N/A'}</b></span>
                    <span>Swap <b>${this.fmtNum(pos.swap)}</b></span>
                    <span>Commissioni <b>${this.fmtNum(pos.commission)}</b></span>
                  </div>
                </div>
              `).join('') : '<div class="pf-empty">Nessuna posizione aperta.</div>'}
            </div>
          </div>
        </div>

        <!-- Ordini pendenti -->
        <div class="card">
          <div class="card-h">Ordini pendenti <span class="count">(${pendingOrders.length})</span></div>
          <div class="row-list scroll-cap">
            ${pendingOrders.length > 0 ? pendingOrders.map(ord => `
              <div class="row-item">
                <div class="row-top">
                  <span class="sym">${this.symbolLabel(ord)}</span>
                  <span class="tag-group">
                    ${this.sideTag(ord.tradeSide)}
                    ${this.tag(ord.orderType)}
                  </span>
                </div>
                <div class="row-meta">
                  <span>Stato <b>${ord.orderStatus ?? 'N/A'}</b></span>
                  <span>Volume <b>${ord.volume ?? 'N/A'}</b></span>
                  <span>Prezzo <b>${ord.limitPrice ?? ord.stopPrice ?? 'N/A'}</b></span>
                  <span>SL <b>${ord.stopLoss ?? 'N/A'}</b></span>
                  <span>TP <b>${ord.takeProfit ?? 'N/A'}</b></span>
                  <span>Scadenza <b>${this.fmtTs(ord.expirationTimestamp)}</b></span>
                </div>
              </div>
            `).join('') : '<div class="pf-empty">Nessun ordine pendente.</div>'}
          </div>
        </div>

        <!-- Trade chiusi -->
        <div class="card">
          <div class="card-h">Trade chiusi · ultimi 30 giorni <span class="count">(${deals.length})</span></div>
          <div class="row-list scroll-cap">
            ${deals.length > 0 ? deals.map(deal => `
              <div class="row-item">
                <div class="row-top">
                  <span class="sym">${this.symbolLabel(deal)}</span>
                  ${this.pnlChip(deal.closePositionDetail.grossProfit)}
                </div>
                <div class="row-meta">
                  <span>Tipo <b>${deal.tradeSide ?? 'N/A'}</b></span>
                  <span>Volume <b>${deal.closePositionDetail.closedVolume ?? deal.volume ?? 'N/A'}</b></span>
                  <span>Entry <b>${deal.closePositionDetail.entryPrice ?? 'N/A'}</b></span>
                  <span>Exit <b>${deal.executionPrice ?? 'N/A'}</b></span>
                  <span>Data <b>${this.fmtDate(deal.executionTime)}</b></span>
                  <span>Commissioni <b>${this.fmtNum(deal.closePositionDetail.commission)}</b></span>
                </div>
              </div>
            `).join('') : '<div class="pf-empty">Nessun trade chiuso negli ultimi 30 giorni.</div>'}
          </div>
        </div>

        <div class="pf-actions">
          <button class="btn btn-ghost" onclick="autoData.refreshAllData()">↻ Aggiorna dati</button>
        </div>
      </div>
    `;
  }

  // Stato non autenticato: invito al login cTrader
  showLoginButton() {
    const el = this.mount();
    if (!el) return;

    el.innerHTML = `
      <div class="pf">
        <div class="pf-head">
          <div>
            <p class="eyebrow"><span class="eyebrow-index">04</span> Portfolio</p>
            <h2 class="panel-title">Dati veri, in sola lettura.</h2>
          </div>
        </div>
        <div class="pf-cta">
          <h3>Collega il tuo conto cTrader</h3>
          <p>Autorizza l'accesso in sola lettura per vedere i dati aggiornati in tempo reale:</p>
          <ul>
            <li>Informazioni conto e balance</li>
            <li>Posizioni aperte</li>
            <li>Storico trade a 30 giorni</li>
            <li>Statistiche di performance</li>
          </ul>
          <p class="note">Sola lettura · nessun ordine, nessuna modifica al conto.</p>
          <a class="btn btn-primary" href="/login-ctrader-oauth">Login cTrader</a>
        </div>
      </div>
    `;
  }

  // Stato di errore
  showError(message) {
    const el = this.mount();
    if (!el) return;

    el.innerHTML = `
      <div class="pf">
        <div class="pf-head">
          <div>
            <p class="eyebrow"><span class="eyebrow-index">04</span> Portfolio</p>
            <h2 class="panel-title">Dati non disponibili.</h2>
          </div>
        </div>
        <div class="pf-error">
          <h3>Impossibile recuperare i dati</h3>
          <p>${message}</p>
          <button class="btn btn-ghost" onclick="autoData.refreshAllData()">↻ Riprova</button>
        </div>
      </div>
    `;
  }
}

// Inizializza quando il DOM è caricato
document.addEventListener('DOMContentLoaded', () => {
  window.autoData = new AutoAccountData();
  window.autoData.initialize();
});
