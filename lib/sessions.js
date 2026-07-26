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
