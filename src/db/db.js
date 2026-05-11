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
      const SQL = await initSqlJs();
      
      // Carica DB esistente o crea nuovo
      if (fs.existsSync(this.dbPath)) {
        const fileBuffer = fs.readFileSync(this.dbPath);
        this.db = SQL.Database(fileBuffer);
        console.log('✅ Database caricato da:', this.dbPath);
      } else {
        this.db = new SQL.Database();
        console.log('📝 Nuovo database creato');
      }

      // Inizializza schema se non esiste
      await this.initSchema();
      
      return this.db;
    } catch (err) {
      console.error('❌ Errore inizializzazione DB:', err);
      throw err;
    }
  }

  async initSchema() {
    try {
      const schemaPath = path.join(__dirname, 'schema.sql');
      const schema = fs.readFileSync(schemaPath, 'utf8');
      
      // Esegui solo se le tabelle non esistono
      const tableCheck = this.db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='soglie_usura'");
      
      if (tableCheck.length === 0 || tableCheck[0].values.length === 0) {
        this.db.run(schema);
        this.save();
        console.log('✅ Schema database inizializzato');
      }
    } catch (err) {
      console.error('❌ Errore schema:', err);
      throw err;
    }
  }

  getDb() {
    return this.db;
  }

  save() {
    if (this.db) {
      const data = this.db.export();
      const buffer = Buffer.from(data);
      fs.writeFileSync(this.dbPath, buffer);
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
