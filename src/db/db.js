const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

class DatabaseManager {
  constructor(dbPath) {
    this.dbPath = dbPath;
    this.db = null;
    this.SQL = null;
  }

  async init() {
    try {
      this.SQL = await initSqlJs();
      
      // Carica DB esistente o crea nuovo
      if (fs.existsSync(this.dbPath)) {
        const fileBuffer = fs.readFileSync(this.dbPath);
        this.db = new this.SQL.Database(fileBuffer);
        console.log('✅ Database caricato da:', this.dbPath);
      } else {
        this.db = new this.SQL.Database();
        console.log('✅ Nuovo database creato in memoria');
      }

      // Esegui schema
      const schemaPath = path.join(__dirname, 'schema.sql');
      const schema = fs.readFileSync(schemaPath, 'utf8');
      this.db.run(schema);
      console.log('✅ Schema database inizializzato');

      // Salva immediatamente
      this.save();
      
      return this.db;
    } catch (error) {
      console.error('❌ Errore inizializzazione DB:', error);
      throw error;
    }
  }

  save() {
    if (!this.db) return;
    
    const data = this.db.export();
    const buffer = Buffer.from(data);
    
    // Assicurati che la cartella esista
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    fs.writeFileSync(this.dbPath, buffer);
  }

  getDb() {
    return this.db;
  }

  close() {
    if (this.db) {
      this.save();
      this.db.close();
    }
  }
}

module.exports = DatabaseManager;
