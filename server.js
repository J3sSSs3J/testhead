// ============================================================
// ametrades - Server
// Express: serve il sito statico (public/) + API cTrader Open API
// via WebSocket JSON (porta 5036). Sola lettura: nessun trading.
// Docs: https://help.ctrader.com/open-api/
// ============================================================

require('dotenv').config();

const express = require('express');
const https = require('https');
const WebSocket = require('ws');
const path = require('path');
const crypto = require('crypto');

// ============================================================
// CONFIGURATION (da .env)
// ============================================================
const CONFIG = {
    CLIENT_ID: process.env.CTRADER_CLIENT_ID || '',
    CLIENT_SECRET: process.env.CTRADER_CLIENT_SECRET || '',
    REDIRECT_URI: process.env.CTRADER_REDIRECT_URI || 'http://localhost:3000/callback',
    PORT: parseInt(process.env.PORT, 10) || 3000,

    // cTrader endpoints (ufficiali)
    AUTH_URL: 'https://id.ctrader.com/my/settings/openapi/grantingaccess/',
    TOKEN_URL: 'https://openapi.ctrader.com/apps/token',

    // WebSocket JSON (default: demo). Live: wss://live.ctraderapi.com:5036
    WS_URL: process.env.CTRADER_WS_URL || 'wss://demo.ctraderapi.com:5036',
};

if (!CONFIG.CLIENT_ID || !CONFIG.CLIENT_SECRET) {
    console.warn('[CONFIG] Attenzione: CTRADER_CLIENT_ID e/o CTRADER_CLIENT_SECRET mancanti nel .env');
}

// ============================================================
// STATE
// ============================================================
const { SessionStore } = require('./lib/sessions');
const { ConnectionsRegistry } = require('./lib/connections');

// Sessioni per-browser: ogni browser ha il proprio token cTrader in memoria.
const sessionStore = new SessionStore();
// Registro persistente: prima connessione di ogni account (data + baseline).
const connections = new ConnectionsRegistry(path.join(__dirname, 'data', 'connections.json'));

let wsConnection = null;
let isAppAuthorized = false;
let authorizedAccounts = new Set();

// Cache nomi simboli: ctidTraderAccountId -> Map(symbolId -> symbolName)
const symbolNameCache = new Map();

// Pending request map: clientMsgId -> { resolve, reject, timer }
const pendingRequests = new Map();
let msgIdCounter = 0;

// ============================================================
// PAYLOAD TYPES (from ProtoOAPayloadType enum)
// ============================================================
const PayloadType = {
    HEARTBEAT: 51,
    OA_APPLICATION_AUTH_REQ: 2100,
    OA_APPLICATION_AUTH_RES: 2101,
    OA_ACCOUNT_AUTH_REQ: 2102,
    OA_ACCOUNT_AUTH_RES: 2103,
    OA_SYMBOLS_LIST_REQ: 2114,
    OA_SYMBOLS_LIST_RES: 2115,
    OA_TRADER_REQ: 2121,
    OA_TRADER_RES: 2122,
    OA_RECONCILE_REQ: 2124,
    OA_RECONCILE_RES: 2125,
    OA_DEAL_LIST_REQ: 2133,
    OA_DEAL_LIST_RES: 2134,
    OA_ERROR_RES: 2142,
    OA_GET_ACCOUNTS_BY_ACCESS_TOKEN_REQ: 2149,
    OA_GET_ACCOUNTS_BY_ACCESS_TOKEN_RES: 2150,
};

// ============================================================
// HELPERS
// ============================================================

function generateMsgId() {
    return `msg_${++msgIdCounter}_${crypto.randomBytes(4).toString('hex')}`;
}

function apiError(message, status) {
    const err = new Error(message);
    err.status = status;
    return err;
}

/**
 * Send a JSON message to cTrader WebSocket and wait for a response
 * matched by clientMsgId.
 */
function sendMessage(payloadType, payload, timeoutMs = 15000) {
    return new Promise((resolve, reject) => {
        if (!wsConnection || wsConnection.readyState !== WebSocket.OPEN) {
            return reject(new Error('WebSocket not connected'));
        }

        const clientMsgId = generateMsgId();
        const msg = JSON.stringify({ clientMsgId, payloadType, payload });

        const timer = setTimeout(() => {
            pendingRequests.delete(clientMsgId);
            reject(new Error(`Request timed out (payloadType: ${payloadType})`));
        }, timeoutMs);

        pendingRequests.set(clientMsgId, { resolve, reject, timer });

        console.log(`[WS SEND] payloadType=${payloadType}, id=${clientMsgId}`);
        wsConnection.send(msg);
    });
}

/**
 * Exchange authorization_code for accessToken via cTrader REST API
 * Official endpoint: GET https://openapi.ctrader.com/apps/token
 */
function exchangeCodeForToken(code) {
    return new Promise((resolve, reject) => {
        const params = new URLSearchParams({
            grant_type: 'authorization_code',
            code: code,
            redirect_uri: CONFIG.REDIRECT_URI,
            client_id: CONFIG.CLIENT_ID,
            client_secret: CONFIG.CLIENT_SECRET,
        });

        const url = `${CONFIG.TOKEN_URL}?${params.toString()}`;

        https.get(url, {
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
            }
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    if (parsed.errorCode) {
                        reject(new Error(`Token error: ${parsed.errorCode} - ${parsed.description}`));
                    } else {
                        resolve(parsed);
                    }
                } catch (e) {
                    reject(new Error('Failed to parse token response'));
                }
            });
        }).on('error', reject);
    });
}

/**
 * Refresh access token
 */
function refreshAccessToken(session) {
    return new Promise((resolve, reject) => {
        if (!session.refreshToken) return reject(new Error('No refresh token available'));

        const params = new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: session.refreshToken,
            client_id: CONFIG.CLIENT_ID,
            client_secret: CONFIG.CLIENT_SECRET,
        });

        const url = `${CONFIG.TOKEN_URL}?${params.toString()}`;

        https.get(url, {
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
            }
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    if (parsed.errorCode) {
                        reject(new Error(`Refresh error: ${parsed.errorCode} - ${parsed.description}`));
                    } else {
                        session.accessToken = parsed.accessToken;
                        session.refreshToken = parsed.refreshToken;
                        resolve(parsed);
                    }
                } catch (e) {
                    reject(new Error('Failed to parse refresh response'));
                }
            });
        }).on('error', reject);
    });
}

// ============================================================
// WEBSOCKET CONNECTION TO cTrader
// ============================================================

let heartbeatInterval = null;

function connectWebSocket() {
    return new Promise((resolve, reject) => {
        console.log(`[WS] Connecting to ${CONFIG.WS_URL}...`);

        if (wsConnection) {
            try { wsConnection.close(); } catch (_) {}
        }
        isAppAuthorized = false;
        authorizedAccounts.clear();

        wsConnection = new WebSocket(CONFIG.WS_URL);

        wsConnection.on('open', () => {
            console.log('[WS] Connected');
            startHeartbeat();
            resolve();
        });

        wsConnection.on('message', (data) => {
            handleWsMessage(data.toString());
        });

        wsConnection.on('error', (err) => {
            console.error('[WS] Error:', err.message);
            reject(err);
        });

        wsConnection.on('close', (code) => {
            console.log(`[WS] Disconnected: code=${code}`);
            stopHeartbeat();
            isAppAuthorized = false;
            authorizedAccounts.clear();
            // Rifiuta subito le richieste in sospeso invece di lasciarle in timeout
            for (const [id, req] of pendingRequests) {
                clearTimeout(req.timer);
                req.reject(new Error('WebSocket disconnected'));
            }
            pendingRequests.clear();
        });
    });
}

function startHeartbeat() {
    stopHeartbeat();
    heartbeatInterval = setInterval(() => {
        if (wsConnection && wsConnection.readyState === WebSocket.OPEN) {
            const msg = JSON.stringify({
                clientMsgId: generateMsgId(),
                payloadType: PayloadType.HEARTBEAT,
                payload: {}
            });
            wsConnection.send(msg);
        }
    }, 10000);
}

function stopHeartbeat() {
    if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
        heartbeatInterval = null;
    }
}

function handleWsMessage(raw) {
    let msg;
    try {
        msg = JSON.parse(raw);
    } catch (e) {
        console.error('[WS] Failed to parse message');
        return;
    }

    const { clientMsgId, payloadType, payload } = msg;
    console.log(`[WS RECV] payloadType=${payloadType}, id=${clientMsgId || 'N/A'}`);

    // Check if it's an error response
    if (payloadType === PayloadType.OA_ERROR_RES) {
        console.error(`[WS ERROR] ${payload.errorCode}: ${payload.description}`);
        if (clientMsgId && pendingRequests.has(clientMsgId)) {
            const req = pendingRequests.get(clientMsgId);
            clearTimeout(req.timer);
            pendingRequests.delete(clientMsgId);
            req.reject(new Error(`API Error: ${payload.errorCode} - ${payload.description || ''}`));
        }
        return;
    }

    // Resolve pending request
    if (clientMsgId && pendingRequests.has(clientMsgId)) {
        const req = pendingRequests.get(clientMsgId);
        clearTimeout(req.timer);
        pendingRequests.delete(clientMsgId);
        req.resolve({ payloadType, payload });
    }
}

// ============================================================
// cTrader API OPERATIONS
// ============================================================

async function applicationAuth() {
    const resp = await sendMessage(PayloadType.OA_APPLICATION_AUTH_REQ, {
        clientId: CONFIG.CLIENT_ID,
        clientSecret: CONFIG.CLIENT_SECRET,
    });
    if (resp.payloadType === PayloadType.OA_APPLICATION_AUTH_RES) {
        isAppAuthorized = true;
        console.log('[API] Application authorized');
    }
    return resp;
}

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

async function getTraderInfo(ctidTraderAccountId) {
    return sendMessage(PayloadType.OA_TRADER_REQ, {
        ctidTraderAccountId: ctidTraderAccountId,
    });
}

async function reconcile(ctidTraderAccountId) {
    return sendMessage(PayloadType.OA_RECONCILE_REQ, {
        ctidTraderAccountId: ctidTraderAccountId,
    });
}

async function getDealList(ctidTraderAccountId, fromTimestamp, toTimestamp, maxRows) {
    return sendMessage(PayloadType.OA_DEAL_LIST_REQ, {
        ctidTraderAccountId: ctidTraderAccountId,
        fromTimestamp: fromTimestamp,
        toTimestamp: toTimestamp,
        maxRows: maxRows || 50,
    });
}

/**
 * Recupera (con cache in memoria) la lista simboli dell'account e
 * restituisce una Map(symbolId -> symbolName). In caso di errore
 * degrada restituendo una Map vuota senza bloccare la risposta.
 */
async function loadSymbolNames(ctidTraderAccountId) {
    if (symbolNameCache.has(ctidTraderAccountId)) {
        return symbolNameCache.get(ctidTraderAccountId);
    }
    try {
        const resp = await sendMessage(PayloadType.OA_SYMBOLS_LIST_REQ, {
            ctidTraderAccountId: ctidTraderAccountId,
        });
        const map = new Map();
        (resp.payload.symbol || []).forEach(s => {
            if (s.symbolId != null && s.symbolName) {
                map.set(Number(s.symbolId), s.symbolName);
            }
        });
        symbolNameCache.set(ctidTraderAccountId, map);
        console.log(`[API] Cached ${map.size} symbol names for account ${ctidTraderAccountId}`);
        return map;
    } catch (err) {
        console.error(`[API] Symbols list failed for account ${ctidTraderAccountId}: ${err.message}`);
        return new Map();
    }
}

// ============================================================
// CONNECTION / AUTH GUARDS
// Se il WebSocket è caduto, riconnette e ripete application auth
// (+ account auth alla prima richiesta) prima di rispondere.
// ============================================================

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

// ============================================================
// EXPRESS SERVER
// ============================================================

const app = express();
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// --- Login redirect (alias: /login-ctrader-oauth, usato dai pulsanti del sito) ---
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

app.get('/login', handleLogin);
app.get('/login-ctrader-oauth', handleLogin);

// --- OAuth callback ---
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

// --- API: Get status (include lista account di base) ---
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

// --- API: List accounts ---
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

// --- API: Get balance/trader info ---
app.get('/api/balance', async (req, res) => {
    try {
        const accountId = parseInt(req.query.accountId, 10);
        if (!accountId) {
            return res.status(400).json({ error: 'Missing accountId parameter' });
        }
        const session = sessionStore.get(req);

        await ensureAccountAuth(session, accountId);
        const resp = await getTraderInfo(accountId);
        const trader = resp.payload.trader || resp.payload;

        // moneyDigits for converting integer values to real amounts
        const moneyDigits = trader.moneyDigits || 2;
        const divisor = Math.pow(10, moneyDigits);

        res.json({
            ctidTraderAccountId: trader.ctidTraderAccountId,
            balance: trader.balance / divisor,
            balanceRaw: trader.balance,
            moneyDigits: moneyDigits,
            depositAssetId: trader.depositAssetId,
            leverageInCents: trader.leverageInCents,
            leverage: trader.leverageInCents ? `1:${trader.leverageInCents / 100}` : 'N/A',
            accountType: trader.accountType === 0 ? 'HEDGED' : trader.accountType === 1 ? 'NETTED' : trader.accountType === 2 ? 'SPREAD_BETTING' : 'UNKNOWN',
            traderLogin: trader.traderLogin,
            brokerName: trader.brokerName,
            registrationTimestamp: trader.registrationTimestamp,
            swapFree: trader.swapFree || false,
            totalMarginCalculationType: trader.totalMarginCalculationType,
            accessRights: trader.accessRights,
        });
    } catch (err) {
        res.status(err.status || 500).json({ error: err.message });
    }
});

// --- API: Get positions (open positions + pending orders) ---
app.get('/api/positions', async (req, res) => {
    try {
        const accountId = parseInt(req.query.accountId, 10);
        if (!accountId) {
            return res.status(400).json({ error: 'Missing accountId parameter' });
        }
        const session = sessionStore.get(req);

        await ensureAccountAuth(session, accountId);
        const resp = await reconcile(accountId);
        const symbolNames = await loadSymbolNames(accountId);

        const positions = (resp.payload.position || []).map(p => {
            const moneyDigits = p.moneyDigits || 2;
            const divisor = Math.pow(10, moneyDigits);
            const symbolId = p.tradeData ? p.tradeData.symbolId : null;
            return {
                positionId: p.positionId,
                symbolId: symbolId,
                symbolName: symbolId != null ? (symbolNames.get(Number(symbolId)) || null) : null,
                tradeSide: p.tradeData ? (p.tradeData.tradeSide === 1 ? 'BUY' : 'SELL') : null,
                volume: p.tradeData ? p.tradeData.volume / 100 : null,
                openTimestamp: p.tradeData ? p.tradeData.openTimestamp : null,
                openTime: p.tradeData && p.tradeData.openTimestamp ? new Date(parseInt(p.tradeData.openTimestamp)).toISOString() : null,
                price: p.price,
                stopLoss: p.stopLoss,
                takeProfit: p.takeProfit,
                swap: p.swap ? p.swap / divisor : 0,
                commission: p.commission ? p.commission / divisor : 0,
                usedMargin: p.usedMargin ? p.usedMargin / divisor : 0,
                positionStatus: p.positionStatus === 1 ? 'OPEN' : p.positionStatus === 2 ? 'CLOSED' : p.positionStatus === 3 ? 'CREATED' : 'ERROR',
                label: p.tradeData ? p.tradeData.label : null,
                comment: p.tradeData ? p.tradeData.comment : null,
                guaranteedStopLoss: p.guaranteedStopLoss || false,
                trailingStopLoss: p.trailingStopLoss || false,
            };
        });

        const orders = (resp.payload.order || []).map(o => {
            const symbolId = o.tradeData ? o.tradeData.symbolId : null;
            return {
                orderId: o.orderId,
                symbolId: symbolId,
                symbolName: symbolId != null ? (symbolNames.get(Number(symbolId)) || null) : null,
                tradeSide: o.tradeData ? (o.tradeData.tradeSide === 1 ? 'BUY' : 'SELL') : null,
                volume: o.tradeData ? o.tradeData.volume / 100 : null,
                orderType: ['', 'MARKET', 'LIMIT', 'STOP', 'STOP_LOSS_TP', 'MARKET_RANGE', 'STOP_LIMIT'][o.orderType] || o.orderType,
                orderStatus: ['', 'ACCEPTED', 'FILLED', 'REJECTED', 'EXPIRED', 'CANCELLED'][o.orderStatus] || o.orderStatus,
                limitPrice: o.limitPrice,
                stopPrice: o.stopPrice,
                stopLoss: o.stopLoss,
                takeProfit: o.takeProfit,
                expirationTimestamp: o.expirationTimestamp,
            };
        });

        res.json({ positions, orders });
    } catch (err) {
        res.status(err.status || 500).json({ error: err.message });
    }
});

// --- API: Get trade history (deals) ---
app.get('/api/history', async (req, res) => {
    try {
        const accountId = parseInt(req.query.accountId, 10);
        if (!accountId) {
            return res.status(400).json({ error: 'Missing accountId parameter' });
        }
        const session = sessionStore.get(req);

        await ensureAccountAuth(session, accountId);

        // Default: last 7 days
        const now = Date.now();
        const from = parseInt(req.query.from, 10) || (now - 7 * 24 * 60 * 60 * 1000);
        const to = parseInt(req.query.to, 10) || now;
        const maxRows = parseInt(req.query.maxRows, 10) || 50;

        const resp = await getDealList(accountId, from, to, maxRows);
        const symbolNames = await loadSymbolNames(accountId);

        const deals = (resp.payload.deal || []).map(d => {
            const moneyDigits = d.moneyDigits || 2;
            const divisor = Math.pow(10, moneyDigits);
            return {
                dealId: d.dealId,
                orderId: d.orderId,
                positionId: d.positionId,
                symbolId: d.symbolId,
                symbolName: d.symbolId != null ? (symbolNames.get(Number(d.symbolId)) || null) : null,
                tradeSide: d.tradeSide === 1 ? 'BUY' : 'SELL',
                volume: d.volume / 100,
                filledVolume: d.filledVolume / 100,
                executionPrice: d.executionPrice,
                createTimestamp: d.createTimestamp,
                createTime: d.createTimestamp ? new Date(parseInt(d.createTimestamp)).toISOString() : null,
                executionTimestamp: d.executionTimestamp,
                executionTime: d.executionTimestamp ? new Date(parseInt(d.executionTimestamp)).toISOString() : null,
                dealStatus: ['', '', 'FILLED', 'PARTIALLY_FILLED', 'REJECTED', 'INTERNALLY_REJECTED', 'ERROR', 'MISSED'][d.dealStatus] || d.dealStatus,
                commission: d.commission ? d.commission / divisor : 0,
                closePositionDetail: d.closePositionDetail ? {
                    entryPrice: d.closePositionDetail.entryPrice,
                    grossProfit: d.closePositionDetail.grossProfit / (Math.pow(10, d.closePositionDetail.moneyDigits || moneyDigits)),
                    swap: d.closePositionDetail.swap / (Math.pow(10, d.closePositionDetail.moneyDigits || moneyDigits)),
                    commission: d.closePositionDetail.commission / (Math.pow(10, d.closePositionDetail.moneyDigits || moneyDigits)),
                    balance: d.closePositionDetail.balance / (Math.pow(10, d.closePositionDetail.moneyDigits || moneyDigits)),
                    closedVolume: d.closePositionDetail.closedVolume ? d.closePositionDetail.closedVolume / 100 : null,
                } : null,
                label: d.label,
                comment: d.comment,
            };
        });

        res.json({
            deals,
            hasMore: resp.payload.hasMore || false,
        });
    } catch (err) {
        res.status(err.status || 500).json({ error: err.message });
    }
});

// --- Start server ---
app.listen(CONFIG.PORT, () => {
    console.log(`\n========================================`);
    console.log(`  ametrades`);
    console.log(`  http://localhost:${CONFIG.PORT}`);
    console.log(`========================================`);
    console.log(`\nWebSocket cTrader: ${CONFIG.WS_URL}`);
    console.log(`Apri http://localhost:${CONFIG.PORT} e clicca "Login cTrader" per collegare l'account.\n`);
});
