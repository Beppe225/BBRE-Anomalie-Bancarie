/**
 * Seed storico soglie usura (2005-2026)
 * Dati simulati basati su trend storici Banca d'Italia
 */

function seedSoglieUsura(db) {
  console.log('📊 Inserimento soglie usura storiche...');

  const soglie = [
    // Mutui ipotecari - trend storico
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
    
    // Credito al consumo
    [2023, 1, 'credito_consumo', 9.25],
    [2024, 1, 'credito_consumo', 10.05],
    [2024, 2, 'credito_consumo', 10.25],
    [2024, 3, 'credito_consumo', 10.45],
    [2024, 4, 'credito_consumo', 10.65],
    
    // CQS (Cessione Quinto Stipendio)
    [2023, 1, 'cqs', 7.85],
    [2024, 1, 'cqs', 8.65],
    [2024, 2, 'cqs', 8.85],
    [2024, 3, 'cqs', 9.05],
    [2024, 4, 'cqs', 9.25]
  ];

  db.run("BEGIN TRANSACTION");
  
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO soglie_usura 
    (anno, trimestre, tipo_contratto, tegm, tasso_soglia, formula_calcolo, data_pubblicazione, hash_dataset)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'seed_v1')
  `);

  for (const [anno, trim, tipo, tegm] of soglie) {
    // Calcolo soglia secondo formula legge
    let soglia, formula, delta;
    
    if (anno < 2011) {
      // Pre-2011: TEGM * 1.5
      soglia = tegm * 1.5;
      formula = 'TEGM*1.5';
      delta = soglia - tegm;
    } else {
      // Post-2011: TEGM + (TEGM * 0.25) + 4%, max 8pp
      const incremento = (tegm * 0.25) + 4;
      const cappedDelta = Math.min(incremento, 8);
      soglia = tegm + cappedDelta;
      formula = 'TEGM+25%+4pp';
      delta = cappedDelta;
    }

    const dataPubb = `${anno}-${String((trim - 1) * 3 + 1).padStart(2, '0')}-01`;
    stmt.run(anno, trim, tipo, parseFloat(tegm.toFixed(4)), parseFloat(soglia.toFixed(4)), formula, dataPubb);
  }

  db.run("COMMIT");
  console.log(`✅ Inserite ${soglie.length} soglie usura (2005-2026)`);
}

module.exports = { seedSoglieUsura };
