const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { ConnectionsRegistry } = require('../lib/connections');

// Sottocartella inesistente: verifica anche il mkdir ricorsivo al salvataggio
function tmpFile() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ametrades-test-'));
    return path.join(dir, 'data', 'connections.json');
}

test('ensure crea la voce, la persiste e non la sovrascrive mai', () => {
    const file = tmpFile();
    const reg = new ConnectionsRegistry(file);
    const first = reg.ensure(123, { connectedAt: '2026-07-26T10:00:00.000Z', baselineBalance: 1000 });
    assert.strictEqual(first.baselineBalance, 1000);

    // Secondo ensure con dati diversi: la voce originale resta intatta
    const second = reg.ensure(123, { connectedAt: '2026-08-01T10:00:00.000Z', baselineBalance: 2000 });
    assert.strictEqual(second.baselineBalance, 1000);
    assert.strictEqual(second.connectedAt, '2026-07-26T10:00:00.000Z');

    // Un nuovo registry sullo stesso file rilegge la voce (persistenza)
    const reloaded = new ConnectionsRegistry(file);
    assert.deepStrictEqual(reloaded.get(123), {
        connectedAt: '2026-07-26T10:00:00.000Z',
        baselineBalance: 1000,
    });
});

test('get: account mai connesso -> null', () => {
    const reg = new ConnectionsRegistry(tmpFile());
    assert.strictEqual(reg.get(999), null);
});

test('file corrotto -> registro vuoto senza crash', () => {
    const file = tmpFile();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, '{non-json');
    const reg = new ConnectionsRegistry(file);
    assert.strictEqual(reg.get(1), null);
});
