// ==================== RECUPERO AUTOMATICO DATI ACCOUNT ====================
// Parla con il backend Express locale (stesso server che serve il sito):
//   GET /api/status, /api/balance, /api/positions, /api/history
// Sola lettura: nessuna operazione di trading.
class AutoAccountData {
  constructor() {
    this.accounts = [];
    this.selectedAccountId = null;
  }

  async initialize() {
    try {
      const res = await fetch('/api/status');
      const status = await res.json();

      if (!status.authenticated) {
        console.log('ℹ️ Non autenticato - mostro pulsante login');
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
      console.error('❌ Errore inizializzazione:', error);
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

    const [balance, positions, history] = await Promise.all([
      fetchJson(`/api/balance?accountId=${id}`).catch(e => ({ __error: e.message })),
      fetchJson(`/api/positions?accountId=${id}`).catch(e => ({ __error: e.message })),
      fetchJson(`/api/history?accountId=${id}&from=${from}&to=${to}&maxRows=100`).catch(e => ({ __error: e.message })),
    ]);

    this.showAllData({ balance, positions, history });
  }

  // Refresh dati (usato dal pulsante)
  async refreshAllData() {
    console.log('🔄 Refresh dati...');
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

  // ---------- Rendering ----------
  showAllData({ balance, positions, history }) {
    const portfolioSection = document.getElementById('content-portfolio');
    if (!portfolioSection) return;

    const openPositions = (positions && !positions.__error && Array.isArray(positions.positions))
      ? positions.positions : [];
    const deals = this.closedDeals(history);
    const errors = [];
    if (balance && balance.__error) errors.push(`Info conto: ${balance.__error}`);
    if (positions && positions.__error) errors.push(`Posizioni: ${positions.__error}`);
    if (history && history.__error) errors.push(`Storico: ${history.__error}`);

    const accountSelector = this.accounts.length > 1 ? `
      <div class="account-selector">
        <label for="account-select">Account:</label>
        <select id="account-select" onchange="autoData.selectAccount(this.value)">
          ${this.accounts.map(a => `
            <option value="${a.id}" ${a.id === this.selectedAccountId ? 'selected' : ''}>
              ${a.broker || 'Broker'} - ${a.login != null ? a.login : a.id} ${a.isLive ? '(LIVE)' : '(DEMO)'}
            </option>`).join('')}
        </select>
      </div>` : '';

    const balanceOk = balance && !balance.__error;

    portfolioSection.innerHTML = `
      <div class="auto-data-container">
        <div class="data-header">
          <h2>📊 Dati Account cTrader</h2>
          <div class="auto-indicator">
            <span class="status-dot success"></span>
            <span>Dati Aggiornati</span>
          </div>
        </div>

        ${accountSelector}

        ${errors.length ? `
        <div class="card">
          <h3>⚠️ Avvisi</h3>
          ${errors.map(e => `<div class="no-data">${e}</div>`).join('')}
        </div>` : ''}

        <!-- Account Info -->
        <div class="card account-card">
          <h3>🏦 Informazioni Account</h3>
          <div class="account-details">
            <div class="detail-row">
              <span class="label">Account ID:</span>
              <span class="value">${balanceOk ? (balance.ctidTraderAccountId ?? this.selectedAccountId) : this.selectedAccountId}</span>
            </div>
            <div class="detail-row">
              <span class="label">Broker:</span>
              <span class="value">${balanceOk ? (balance.brokerName || 'N/A') : 'N/A'}</span>
            </div>
            <div class="detail-row">
              <span class="label">Login:</span>
              <span class="value">${balanceOk ? (balance.traderLogin ?? 'N/A') : 'N/A'}</span>
            </div>
            <div class="detail-row">
              <span class="label">Balance:</span>
              <span class="value balance">${balanceOk ? this.fmtNum(balance.balance) : 'N/A'}</span>
            </div>
            <div class="detail-row">
              <span class="label">Leva:</span>
              <span class="value">${balanceOk ? (balance.leverage || 'N/A') : 'N/A'}</span>
            </div>
            <div class="detail-row">
              <span class="label">Tipo Conto:</span>
              <span class="value">${balanceOk ? (balance.accountType || 'N/A') : 'N/A'}</span>
            </div>
            <div class="detail-row">
              <span class="label">Equity:</span>
              <span class="value">N/A</span>
            </div>
            <div class="detail-row">
              <span class="label">Margin Level:</span>
              <span class="value">N/A</span>
            </div>
          </div>
        </div>

        <!-- Posizioni Aperte -->
        <div class="card positions-card">
          <h3>📈 Posizioni Aperte (${openPositions.length})</h3>
          <div class="positions-list">
            ${openPositions.length > 0 ? openPositions.map(pos => `
              <div class="position-item">
                <div class="position-header">
                  <span class="symbol">${this.symbolLabel(pos)}</span>
                  <span class="profit ${pos.tradeSide === 'BUY' ? 'positive' : 'negative'}">${pos.tradeSide || 'N/A'}</span>
                </div>
                <div class="position-info">
                  <span>Volume: ${pos.volume ?? 'N/A'}</span>
                  <span>Apertura: ${pos.price ?? 'N/A'}</span>
                  <span>SL: ${pos.stopLoss ?? 'N/A'}</span>
                  <span>TP: ${pos.takeProfit ?? 'N/A'}</span>
                  <span>Swap: ${this.fmtNum(pos.swap)}</span>
                  <span>Commissioni: ${this.fmtNum(pos.commission)}</span>
                  <span>Aperta il: ${this.fmtDate(pos.openTime)}</span>
                </div>
              </div>
            `).join('') : '<div class="no-data">Nessuna posizione aperta</div>'}
          </div>
        </div>

        <!-- Trade Chiusi (ultimi 30 giorni) -->
        <div class="card trades-card">
          <h3>📋 Trade Chiusi - 30 giorni (${deals.length})</h3>
          <div class="trades-list">
            ${deals.length > 0 ? deals.map(deal => `
              <div class="trade-item">
                <div class="trade-header">
                  <span class="symbol">${this.symbolLabel(deal)}</span>
                  <span class="profit ${(deal.closePositionDetail.grossProfit || 0) >= 0 ? 'positive' : 'negative'}">
                    ${this.fmtNum(deal.closePositionDetail.grossProfit)}
                  </span>
                </div>
                <div class="trade-info">
                  <span>Tipo: ${deal.tradeSide}</span>
                  <span>Volume: ${deal.closePositionDetail.closedVolume ?? deal.volume ?? 'N/A'}</span>
                  <span>Entry: ${deal.closePositionDetail.entryPrice ?? 'N/A'}</span>
                  <span>Exit: ${deal.executionPrice ?? 'N/A'}</span>
                  <span>Data: ${this.fmtDate(deal.executionTime)}</span>
                  <span>Commissioni: ${this.fmtNum(deal.closePositionDetail.commission)}</span>
                </div>
              </div>
            `).join('') : '<div class="no-data">Nessun trade chiuso negli ultimi 30 giorni</div>'}
          </div>
        </div>

        <!-- Statistiche -->
        <div class="card stats-card">
          <h3>📊 Statistiche Trading (30 giorni)</h3>
          <div class="stats-grid">
            <div class="stat-item">
              <span class="stat-label">Trade Chiusi</span>
              <span class="stat-value">${deals.length}</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">Profit Totale</span>
              <span class="stat-value ${this.getTotalProfit(deals) >= 0 ? 'positive' : 'negative'}">
                ${this.fmtNum(this.getTotalProfit(deals))}
              </span>
            </div>
            <div class="stat-item">
              <span class="stat-label">Win Rate</span>
              <span class="stat-value">${this.getWinRate(deals)}%</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">Profit Medio</span>
              <span class="stat-value">${this.fmtNum(this.getAverageProfit(deals))}</span>
            </div>
          </div>
        </div>

        <!-- Refresh Button -->
        <div class="refresh-section">
          <button class="refresh-btn" onclick="autoData.refreshAllData()">
            🔄 Aggiorna Dati
          </button>
        </div>
      </div>
    `;

    this.addStyles();
  }

  // Mostra pulsante login
  showLoginButton() {
    const portfolioSection = document.getElementById('content-portfolio');
    if (!portfolioSection) return;

    portfolioSection.innerHTML = `
      <div class="login-auto-container">
        <div class="login-card">
          <h2>🔐 Recupero Automatico Dati cTrader</h2>
          <p>Clicca qui sotto per recuperare automaticamente tutti i dati del tuo account cTrader:</p>
          <ul>
            <li>✅ Account ID</li>
            <li>✅ Balance</li>
            <li>✅ Posizioni Aperte</li>
            <li>✅ Storico Trade</li>
          </ul>
          <p class="note">Modalità read-only - Nessuna operazione di trading</p>

          <button class="auto-login-btn" onclick="window.location.href='/login-ctrader-oauth'">
            🚀 Recupera Dati Automaticamente
          </button>
        </div>
      </div>
    `;

    this.addStyles();
  }

  // Mostra errore
  showError(message) {
    const portfolioSection = document.getElementById('content-portfolio');
    if (!portfolioSection) return;

    portfolioSection.innerHTML = `
      <div class="error-container">
        <div class="error-card">
          <h2>❌ Errore Recupero Dati</h2>
          <p>${message}</p>
          <button class="retry-btn" onclick="autoData.refreshAllData()">
            🔄 Riprova
          </button>
        </div>
      </div>
    `;

    this.addStyles();
  }

  // Aggiungi stili
  addStyles() {
    if (document.getElementById('auto-data-styles')) return;

    const style = document.createElement('style');
    style.id = 'auto-data-styles';
    style.textContent = `
      .auto-data-container {
        padding: 20px;
        max-width: 1200px;
        margin: 0 auto;
      }

      .data-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 30px;
        padding: 20px;
        background: linear-gradient(45deg, rgba(76, 175, 80, 0.2), rgba(138, 43, 226, 0.2));
        border-radius: 12px;
        border: 1px solid rgba(76, 175, 80, 0.3);
      }

      .data-header h2 {
        color: #4CAF50;
        margin: 0;
        font-size: 24px;
      }

      .auto-indicator {
        display: flex;
        align-items: center;
        gap: 10px;
        color: #4CAF50;
        font-weight: bold;
      }

      .status-dot {
        width: 12px;
        height: 12px;
        border-radius: 50%;
        animation: pulse 2s infinite;
      }

      .status-dot.success {
        background: #4CAF50;
      }

      @keyframes pulse {
        0% { opacity: 1; }
        50% { opacity: 0.5; }
        100% { opacity: 1; }
      }

      .account-selector {
        display: flex;
        align-items: center;
        gap: 12px;
        margin-bottom: 20px;
        padding: 14px 20px;
        background: rgba(15, 52, 96, 0.9);
        border: 1px solid rgba(138, 43, 226, 0.3);
        border-radius: 12px;
        color: #ccc;
      }

      .account-selector select {
        background: rgba(138, 43, 226, 0.15);
        color: #fff;
        border: 1px solid rgba(138, 43, 226, 0.4);
        border-radius: 8px;
        padding: 8px 12px;
        font-size: 14px;
        cursor: pointer;
      }

      .card {
        background: rgba(15, 52, 96, 0.9);
        border-radius: 12px;
        padding: 20px;
        margin-bottom: 20px;
        border: 1px solid rgba(138, 43, 226, 0.3);
        transition: transform 0.3s ease, box-shadow 0.3s ease;
      }

      .card:hover {
        transform: translateY(-2px);
        box-shadow: 0 10px 30px rgba(138, 43, 226, 0.2);
      }

      .card h3 {
        color: #8a2be2;
        margin: 0 0 20px 0;
        font-size: 20px;
      }

      .account-details, .stats-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: 15px;
      }

      .detail-row, .stat-item {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 10px;
        background: rgba(138, 43, 226, 0.1);
        border-radius: 8px;
      }

      .label, .stat-label {
        color: #888;
        font-size: 14px;
      }

      .value, .stat-value {
        color: #fff;
        font-weight: bold;
        font-size: 16px;
      }

      .value.balance, .value.equity {
        color: #4CAF50;
        font-size: 18px;
      }

      .value.positive, .stat-value.positive {
        color: #4CAF50;
      }

      .value.negative, .stat-value.negative {
        color: #f44336;
      }

      .positions-list, .trades-list {
        max-height: 400px;
        overflow-y: auto;
      }

      .position-item, .trade-item {
        background: rgba(138, 43, 226, 0.1);
        border-radius: 8px;
        padding: 15px;
        margin-bottom: 10px;
        border: 1px solid rgba(138, 43, 226, 0.2);
      }

      .position-header, .trade-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 10px;
      }

      .symbol {
        font-weight: bold;
        color: #8a2be2;
        font-size: 16px;
      }

      .profit {
        font-weight: bold;
        padding: 4px 8px;
        border-radius: 4px;
        font-size: 14px;
      }

      .profit.positive {
        background: rgba(76, 175, 80, 0.2);
        color: #4CAF50;
      }

      .profit.negative {
        background: rgba(244, 67, 54, 0.2);
        color: #f44336;
      }

      .position-info, .trade-info {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
        gap: 8px;
        font-size: 12px;
        color: #ccc;
      }

      .no-data {
        text-align: center;
        color: #888;
        padding: 20px;
        font-style: italic;
      }

      .refresh-section {
        text-align: center;
        margin-top: 30px;
      }

      .refresh-btn {
        background: linear-gradient(45deg, #8a2be2, #9370db);
        color: white;
        border: none;
        padding: 14px 32px;
        border-radius: 8px;
        font-weight: bold;
        cursor: pointer;
        transition: all 0.3s ease;
      }

      .refresh-btn:hover {
        transform: translateY(-2px);
        box-shadow: 0 8px 25px rgba(138, 43, 226, 0.3);
      }

      .login-auto-container {
        display: flex;
        justify-content: center;
        align-items: center;
        min-height: 600px;
        padding: 20px;
      }

      .login-card {
        background: rgba(15, 52, 96, 0.95);
        border-radius: 16px;
        padding: 40px;
        text-align: center;
        max-width: 500px;
        border: 1px solid rgba(138, 43, 226, 0.3);
      }

      .login-card h2 {
        color: #8a2be2;
        margin-bottom: 20px;
      }

      .login-card p {
        color: #ccc;
        margin-bottom: 20px;
      }

      .login-card ul {
        text-align: left;
        color: #4CAF50;
        margin-bottom: 20px;
      }

      .note {
        background: rgba(76, 175, 80, 0.1);
        border-radius: 8px;
        padding: 12px;
        margin-bottom: 30px;
        color: #4CAF50;
        font-size: 14px;
      }

      .auto-login-btn {
        background: linear-gradient(45deg, #4CAF50, #45a049);
        color: white;
        border: none;
        padding: 16px 32px;
        border-radius: 12px;
        font-weight: bold;
        font-size: 16px;
        cursor: pointer;
        transition: all 0.3s ease;
      }

      .auto-login-btn:hover {
        transform: translateY(-3px);
        box-shadow: 0 10px 30px rgba(76, 175, 80, 0.4);
      }

      .error-container {
        display: flex;
        justify-content: center;
        align-items: center;
        min-height: 400px;
      }

      .error-card {
        background: rgba(244, 67, 54, 0.1);
        border-radius: 12px;
        padding: 30px;
        text-align: center;
        border: 1px solid rgba(244, 67, 54, 0.3);
        max-width: 400px;
      }

      .error-card h2 {
        color: #f44336;
        margin-bottom: 20px;
      }

      .retry-btn {
        background: linear-gradient(45deg, #f44336, #d32f2f);
        color: white;
        border: none;
        padding: 12px 24px;
        border-radius: 8px;
        font-weight: bold;
        cursor: pointer;
        transition: all 0.3s ease;
      }
    `;
    document.head.appendChild(style);
  }
}

// Inizializza quando il DOM è caricato
document.addEventListener('DOMContentLoaded', () => {
  window.autoData = new AutoAccountData();
  window.autoData.initialize();
});
