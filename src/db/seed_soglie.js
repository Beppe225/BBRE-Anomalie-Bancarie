function seedSoglie(db) {
  console.log('📊 [Seed] Inserimento soglie storiche base...');
  
  // Dataset rappresentativo (in produzione verrà popolato dall'updater)
  const datiBase = [
    [2005, 1, 'mutuo_ipotecario', 4.20],
    [2010, 3, 'mutuo_ipotecario', 3.85],
    [2012, 1, 'mutuo_ipotecario', 5.10],
    [2015, 2, 'mutuo_ipotecario', 2.90],
    [2020, 4, 'mutuo_ipotecario', 1.85],
    [2023, 1, 'mutuo_ipotecario', 4.50],
    [2024, 3, 'mutuo_ipotecario', 5.20],
    [2005, 1, 'credito_consumo', 8.50],
    [2015, 2, 'credito_consumo', 7.20],
    [2024, 3, 'credito_consumo', 9.80]
  ];

  db.run("BEGIN TRANSACTION");
  const stmt = db.prepare("INSERT OR IGNORE INTO soglie_usura (anno, trimestre, tipo_contratto, tegm, tasso_soglia, hash_dataset) VALUES (?, ?, ?, ?, ?, ?)");
  
  for (const [anno, trim, tipo, tegm] of datiBase) {
    const soglia = anno < 2011 ? (tegm * 1.5).toFixed(4) : (tegm + Math.min((tegm * 0.25) + 4, 8)).toFixed(4);
    stmt.run(anno, trim, tipo, tegm.toFixed(4), soglia, 'seed_v1');
  }
  
  stmt.free();
  db.run("COMMIT");
  console.log('✅ [Seed] Dataset storico base caricato.');
}

module.exports = { seedSoglie };
