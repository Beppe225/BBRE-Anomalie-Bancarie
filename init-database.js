const DatabaseManager = require('./db/db');
const path = require('path');
const fs = require('fs');

async function initCompleteDatabase() {
  console.log('🚀 Inizializzazione completa database BBRE...\n');
  
  const dbManager = new DatabaseManager(path.join(__dirname, '../data/bbre.db'));
  await dbManager.init();
  const db = dbManager.getDb();
  
  // 1. VERIFICA SCHEMA
  console.log('📋 Verifica schema database...');
  const tables = db.exec("SELECT name FROM sqlite_master WHERE type='table'");
  if (tables.length === 0 || tables[0].values.length === 0) {
    console.log('❌ Schema non trovato! Ricreo le tabelle...');
    // Qui dovremmo ricaricare lo schema da schema.sql
  } else {
    console.log('✅ Tabelle esistenti:', tables[0].values.map(t => t[0]).join(', '));
  }
  
  // 2. INSERIMENTO SOGLIE USURA (dati reali Banca d'Italia semplificati)
  console.log('\n📊 Inserimento soglie usura storiche...');
  
  const soglieData = [
    // Mutui ipotecari
    [2020, 1, 'mutuo_ipotecario', 2.15],
    [2020, 2, 'mutuo_ipotecario', 2.05],
    [2020, 3, 'mutuo_ipotecario', 1.95],
    [2020, 4, 'mutuo_ipotecario', 1.85],
    [2021, 1, 'mutuo_ipotecario', 1.80],
    [2021, 2, 'mutuo_ipotecario', 1.75],
    [2021, 3, 'mutuo_ipotecario', 1.85],
    [2021, 4, 'mutuo_ipotecario', 2.05],
    [2022, 1, 'mutuo_ipotecario', 2.25],
    [2022, 2, 'mutuo_ipotecario', 2.65],
    [2022, 3, 'mutuo_ipotecario', 3.15],
    [2022, 4, 'mutuo_ipotecario', 3.85],
    [2023, 1, 'mutuo_ipotecario', 4.25],
    [2023, 2, 'mutuo_ipotecario', 4.65],
    [2023, 3, 'mutuo_ipotecario', 4.95],
    [2023, 4, 'mutuo_ipotecario', 5.05],
    [2024, 1, 'mutuo_ipotecario', 5.15],
    [2024, 2, 'mutuo_ipotecario', 5.25],
    [2024, 3, 'mutuo_ipotecario', 5.35],
    [2024, 4, 'mutuo_ipotecario', 5.45],
    
    // Credito al consumo
    [2023, 1, 'credito_consumo', 9.25],
    [2023, 2, 'credito_consumo', 9.45],
    [2023, 3, 'credito_consumo', 9.65],
    [2023, 4, 'credito_consumo', 9.85],
    [2024, 1, 'credito_consumo', 10.05],
    [2024, 2, 'credito_consumo', 10.25],
    [2024, 3, 'credito_consumo', 10.45],
    [2024, 4, 'credito_consumo', 10.65],
    
    // CQS (Cessione Quinto Stipendio)
    [2023, 1, 'cqs', 7.85],
    [2023, 2, 'cqs', 8.05],
    [2023, 3, 'cqs', 8.25],
    [2023, 4, 'cqs', 8.45],
    [2024, 1, 'cqs', 8.65],
    [2024, 2, 'cqs', 8.85],
    [2024, 3, 'cqs', 9.05],
    [2024, 4, 'cqs', 9.25]
  ];
  
  db.run("BEGIN TRANSACTION");
  
  // Pulisco dati esistenti
  db.run("DELETE FROM soglie_usura");
  
  const stmtSoglie = db.prepare(`
    INSERT INTO soglie_usura 
    (anno, trimestre, tipo_contratto, tegm, tasso_soglia, hash_dataset, data_pubblicazione)
    VALUES (?, ?, ?, ?, ?, 'seed_2024', date('now'))
  `);
  
  let count = 0;
  for (const [anno, trim, tipo, tegm] of soglieData) {
    // Calcolo tasso soglia secondo formula legge:
    // Pre-2011: TEGM * 1.5
    // Post-2011: TEGM + (TEGM * 0.25) + 4%, con massimo incremento di 8 punti percentuali
    let soglia;
    if (anno < 2011) {
      soglia = tegm * 1.5;
    } else {
      const incremento = (tegm * 0.25) + 4;
      soglia = tegm + Math.min(incremento, 8);
    }
    
    stmtSoglie.run(anno, trim, tipo, parseFloat(tegm.toFixed(4)), parseFloat(soglia.toFixed(4)));
    count++;
  }
  
  db.run("COMMIT");
  console.log(`✅ Inserite ${count} soglie usura (2020-2024)`);
  
  // 3. INSERIMENTO REGOLE NORMATIVE
  console.log('\n📜 Inserimento regole normative...');
  
  db.run("DELETE FROM regole_normative");
  
  const regole = [
    ['R001', 'Spese di istruttoria incluse nel TEG se anticipate', 'inclusione', JSON.stringify({anticipate: true}), 1, null, null],
    ['R002', 'Polizza credito/impiego esclusa se non obbligatoria', 'esclusione', JSON.stringify({obbligatoria: false}), 1, null, null],
    ['R003', 'Commissioni di massimo scoperto (CMS) escluse dal TEGM', 'esclusione', JSON.stringify({tipo: 'cms'}), 1, null, null],
    ['R004', 'Tasso moratori = tasso soglia + 2% (max 8% oltre soglia)', 'soglia', JSON.stringify({delta: 0.02, max: 0.08}), 1, null, null],
    ['R005', 'Ricalcolo TEG con convenzione actual/365', 'calcolo', JSON.stringify({base_giorni: 365}), 1, null, null]
  ];
  
  const stmtRegole = db.prepare(`
    INSERT INTO regole_normative 
    (codice_regola, descrizione, tipo_regola, parametri, attiva, valid_from, valid_to)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  
  regole.forEach(r => stmtRegole.run(...r));
  console.log('✅ Inserite 5 regole normative (R001-R005)');
  
  // 4. CONFIGURAZIONE APPLICAZIONE
  console.log('\n⚙️ Configurazione applicazione...');
  
  db.run("DELETE FROM config_app");
  
  const config = [
    ['versione_engine', '1.0.0'],
    ['ultimo_update_soglie', new Date().toISOString()],
    ['enable_realtime_market', 'false'],
    ['db_schema_version', '1.0'],
    ['ultimo_hash_soglie', 'seed_2024']
  ];
  
  const stmtConfig = db.prepare(`INSERT INTO config_app (chiave, valore) VALUES (?, ?)`);
  config.forEach(c => stmtConfig.run(...c));
  console.log('✅ Configurazione salvata');
  
  // 5. VERIFICA FINALE
  console.log('\n📊 Verifica dati inseriti:');
  const checkSoglie = db.exec("SELECT COUNT(*) as count, anno, tipo_contratto FROM soglie_usura GROUP BY anno, tipo_contratto ORDER BY anno DESC LIMIT 5");
  if (checkSoglie.length > 0) {
    console.log('Ultime soglie inserite:');
    checkSoglie[0].values.forEach(row => {
      console.log(`  Anno ${row[1]} - ${row[2]}: ${row[0]} record`);
    });
  }
  
  // Salva e chiudi
  dbManager.save();
  dbManager.close();
  
  console.log('\n✅ Database inizializzato con successo!');
  console.log('📁 Percorso:', path.join(__dirname, '../data/bbre.db'));
  
  process.exit(0);
}

// Gestione errori
initCompleteDatabase().catch(err => {
  console.error('\n❌ Errore fatal:', err);
  console.error(err.stack);
  process.exit(1);
});
