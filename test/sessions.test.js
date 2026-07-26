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
