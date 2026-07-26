// Registro persistente delle connessioni: accountId -> data di prima
// connessione + balance di partenza (baseline). La voce nasce alla prima
// autorizzazione dell'account e non viene mai più toccata: il grafico
// riparte sempre dal giorno originale, anche dopo riavvii e nuovi login.
const fs = require('fs');
const path = require('path');

class ConnectionsRegistry {
    constructor(filePath) {
        this.filePath = filePath;
        this.entries = {};
        try {
            if (fs.existsSync(filePath)) {
                this.entries = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            }
        } catch (err) {
            console.error(`[CONNECTIONS] File illeggibile (${err.message}): riparto con registro vuoto`);
            this.entries = {};
        }
    }

    get(accountId) {
        return this.entries[String(accountId)] || null;
    }

    ensure(accountId, entry) {
        const key = String(accountId);
        if (!this.entries[key]) {
            this.entries[key] = entry;
            this.save();
        }
        return this.entries[key];
    }

    save() {
        fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
        fs.writeFileSync(this.filePath, JSON.stringify(this.entries, null, 2));
    }
}

module.exports = { ConnectionsRegistry };
