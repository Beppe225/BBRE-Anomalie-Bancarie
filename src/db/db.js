const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');

class DatabaseManager {
  constructor(dbPath) {
    this.dbPath = dbPath;
    this.db = null;
  }

  async init() {
    try {
      console.log('🗄️  Inizializzazione sql.js...');
      
      // Inizializza il modulo WASM in modo esplicito e sicuro
      const SQL = await initSqlJs({
        locateFile: (file) => path.join(__dirname, '../../node_modules/sql.js/dist/', file)
      });

      if (fs.existsSync(this.dbPath)) {
        const buffer = fs.readFileSync(this.dbPath);
        // sql.js si aspetta Uint8Array, converte Buffer di Node
        this.db = new SQL.Database(new Uint8Array(buffer));
        console.log('✅ Database caricato da:', this.dbPath);
      } else {
        this.db = new SQL.Database();
        console.log('📝 Nuovo database creato in memoria');
      }

      return this.db;
    } catch (err) {
      console.error('❌ Errore critico DB:', err.message);
      throw err;
    }
  }

  getDb() {
    return this.db;
  }

  save() {
    if (this.db) {
      const data = this.db.export();
      // Assicura che la cartella esista
      const dir = path.dirname(this.dbPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      
      fs.writeFileSync(this.dbPath, Buffer.from(data));
      console.log('💾 Database salvato su disco');
    }
  }

  close() {
    this.save();
    if (this.db) {
      this.db.close();
    }
  }
}

module.exports = DatabaseManager;
