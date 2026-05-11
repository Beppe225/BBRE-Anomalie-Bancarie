const DatabaseManager = require('./db');
const path = require('path');

async function seedDatabase() {
  const dbManager = new DatabaseManager(path.join(__dirname, '../../data/bbre.db'));
  await dbManager.init();
  const db = dbManager.getDb();
  
  console.log('📊 Inserimento soglie storiche (2005-2026)...');
  
  // Dataset rappresentativo mutuo ipotecario
  const soglie = [
    [2005, 1, 'mutuo_ipotecario', 4.20],
    [2010, 3, 'mutuo_ipotecario', 3.85],
    [2012, 1, 'mutuo_ipotecario', 5.10],
    [2015, 2, 'mutuo_ipotecario', 2.90],
    [2020, 4, 'mutuo_ipotecario', 1.85],
    [2023, 1, 'mutuo_ipotecario', 4.50],
    [2024, 1, 'mutuo_ipotecario', 5.20],
    [2024, 2, 'mutuo_ipotecario', 5.35],
    [2024, 3, 'mutuo_ipotecario', 5.50],
    [2024, 4, 'mutuo_ipotecario', 5.65],
    [2025, 1, 'mutuo_ipotecario', 5.80],
    [2005, 1, 'credito_consumo', 8.50],
    [2015, 2, 'credito_consumo', 7.20],
    [2024, 3, 'credito_consumo', 9.80],
    [2025, 1, 'credito_consumo', 10.20]
  ];
  
  db.run("BEGIN TRANSACTION");
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO soglie_usura 
    (anno, trimestre, tipo_contratto, tegm, tasso_soglia, hash_dataset, data_pubblicazione)
    VALUES (?, ?, ?, ?, ?, 'seed_v1', '2024-01-01')
  `);
  
  for (const [anno, trim, tipo, tegm] of soglie) {
    // Calcola soglia: pre-2011 TEGM*1.5, post-2011 TEGM + 25% + 4pp (max 8pp)
    let soglia;
    if (anno < 2011) {
      soglia = tegm * 1.5;
    } else {
      const delta = (tegm * 0.25) + 4;
      const cappedDelta = Math.min(delta, 8);
      soglia = tegm + cappedDelta;
    }
    
    stmt.run(anno, trim, tipo, tegm.toFixed(4), soglia.toFixed(4));
  }
  
  db.run("COMMIT");
  console.log(`✅ Inserite ${soglie.length} soglie.`);
  
  // Seed regole normative
  console.log('📜 Inserimento regole normative...');
  const regole = [
    ['R001', 'Spese di istruttoria incluse nel TEG se anticipate', 'inclusione', JSON.stringify({anticipate: true}), 1],
    ['R002', 'Polizza credito/impiego esclusa se non obbligatoria', 'esclusione', JSON.stringify({obbligatoria: false}), 1],
    ['R003', 'Commissioni di massimo scoperto escluse dal TEGM', 'esclusione', JSON.stringify({tipo: 'cms'}), 1],
    ['R004', 'Tasso mora = tasso soglia + 2% (max 8%)', 'soglia', JSON.stringify({delta: 0.02, max: 0.08}), 1],
    ['R005', 'Ricalcolo TEG con convenzione actual/365', 'calcolo', JSON.stringify({base_giorni: 365}), 1]
  ];
  
  const stmtRegole = db.prepare(`
    INSERT OR IGNORE INTO regole_normative 
    (codice_regola, descrizione, tipo_regola, parametri, attiva)
    VALUES (?, ?, ?, ?, ?)
  `);
  
  for (const r of regole) {
    stmtRegole.run(...r);
  }
  
  console.log('✅ Regole R001-R005 inserite.');
  
  dbManager.save();
  console.log('💾 Database salvato.');
  process.exit(0);
}

seedDatabase().catch(err => {
  console.error('❌ Errore:', err);
  process.exit(1);
});
