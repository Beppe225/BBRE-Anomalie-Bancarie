/**
 * BBRE Anomalie Bancarie — DB module
 * Singleton better-sqlite3 con WAL mode e FK abilitate
 */

'use strict';

const path = require('path');
const fs   = require('fs');

let _db = null;

/**
 * Restituisce la connessione singleton al DB.
 * Il file DB viene creato nella cartella userData di Electron (o /data in dev).
 */
function getDb() {
  if (_db) return _db;

  // In modalità Electron usa app.getPath('userData'), in dev usa /data locale
  let dbDir;
  try {
    const { app } = require('electron');
    // In Electron: usa userData
    dbDir = app.getPath('userData');
  } catch {
    // Standalone (migration/seed): usa cartella /data nella root progetto
    dbDir = path.join(__dirname, '..', '..', 'data');
  }

  if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

  const dbPath = path.join(dbDir, 'bbre_ab.sqlite');
  const Database = require('better-sqlite3');

  _db = new Database(dbPath, {
    // verbose: console.log  // decommentare per debug query
  });

  // Configurazione essenziale
  _db.pragma('journal_mode = WAL');
  _db.pragma('foreign_keys = ON');
  _db.pragma('synchronous = NORMAL');  // buon compromesso performance/sicurezza
  _db.pragma('cache_size = -16000');   // 16MB cache

  return _db;
}

/**
 * Chiude la connessione (da chiamare alla chiusura di Electron)
 */
function closeDb() {
  if (_db) {
    _db.close();
    _db = null;
  }
}

module.exports = { getDb, closeDb };
