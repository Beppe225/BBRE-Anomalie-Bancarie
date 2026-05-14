/**
 * BBRE Anomalie Bancarie — Migration 001: init schema
 * Eseguibile standalone: node src/db/migrations/001_init.js
 */

'use strict';

const path = require('path');
const fs   = require('fs');

// Bootstrap DB senza Electron (per esecuzione standalone)
process.env.BBRE_STANDALONE = '1';

const { getDb, closeDb } = require('../db');

function run() {
  const db = getDb();

  // Legge lo schema SQL
  const schemaPath = path.join(__dirname, '..', 'schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf8');

  // db.exec() esegue l'intero file SQL in una sola chiamata (supporta multi-statement)
  // Rimuoviamo solo le righe PRAGMA perché better-sqlite3 le gestisce via .pragma()
  const migrate = db.transaction(() => {
    const clean = schema
      .split('\n')
      .filter(l => !l.trim().startsWith('PRAGMA'))
      .join('\n');
    db.exec(clean);
    // Conta le tabelle create come proxy del successo
    const tabelle = db.prepare(
      "SELECT COUNT(*) as n FROM sqlite_master WHERE type='table'"
    ).get();
    return tabelle.n;
  });

  try {
    const count = migrate();
    console.log(`✅ Migration 001 completata — ${count} tabelle nel DB`);

    // Verifica tabelle create
    const tabelle = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    ).all();
    console.log('📋 Tabelle create:', tabelle.map(t => t.name).join(', '));

  } catch (err) {
    console.error('❌ Migration fallita:', err.message);
    process.exit(1);
  } finally {
    closeDb();
  }
}

run();
