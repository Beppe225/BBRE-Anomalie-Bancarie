/**
 * soglia_calculator.js - Recupero soglie usura da DB
 * FASE 2: Query robuste per sql.js
 */

function get_soglia_db(db, data_stipula, tipo_contratto) {
  try {
    const date = new Date(data_stipula);
    const anno = date.getFullYear();
    const trimestre = Math.ceil((date.getMonth() + 1) / 3);

    console.log(`🔍 Ricerca soglia: Anno=${anno}, Trimestre=${trimestre}, Tipo='${tipo_contratto}'`);

    // Verifica che la tabella esista e abbia dati
    const checkTable = db.exec("SELECT COUNT(*) as count FROM soglie_usura");
    if (checkTable.length === 0 || checkTable[0].values[0][0] === 0) {
      console.error('❌ Tabella soglie_usura vuota o inesistente!');
      return null;
    }
    console.log(`✅ Tabella ha ${checkTable[0].values[0][0]} record`);

    // Query diretta con string interpolation (più affidabile in sql.js)
    const query = `SELECT * FROM soglie_usura 
                   WHERE anno = ${anno} 
                   AND trimestre = ${trimestre} 
                   AND tipo_contratto = '${tipo_contratto}' 
                   LIMIT 1`;
    
    console.log('Query eseguita:', query);
    const res = db.exec(query);
    
    if (res.length > 0 && res[0].values.length > 0) {
      const row = res[0].values[0];
      const cols = res[0].columns;
      const record = {};
      cols.forEach((col, idx) => {
        record[col] = row[idx];
      });
      
      console.log('✅ Soglia trovata:', record);
      console.log(`   TEGM: ${record.tegm}`);
      console.log(`   Tasso Soglia: ${record.tasso_soglia}`);
      
      return record;
    }

    // Fallback: trimestre precedente
    const prevTrim = trimestre === 1 ? 4 : trimestre - 1;
    const prevAnno = trimestre === 1 ? anno - 1 : anno;
    console.log(`⚠️ Non trovato per Q${trimestre}/${anno}. Provo Q${prevTrim}/${prevAnno}`);
    
    const queryFallback = `SELECT * FROM soglie_usura 
                          WHERE anno = ${prevAnno} 
                          AND trimestre = ${prevTrim} 
                          AND tipo_contratto = '${tipo_contratto}' 
                          LIMIT 1`;
    
    const resFallback = db.exec(queryFallback);
    
    if (resFallback.length > 0 && resFallback[0].values.length > 0) {
      const row = resFallback[0].values[0];
      const cols = resFallback[0].columns;
      const record = {};
      cols.forEach((col, idx) => record[col] = row[idx]);
      
      console.log('✅ Soglia fallback trovata:', record);
      return record;
    }

    console.warn(`❌ Nessuna soglia trovata per ${tipo_contratto} Q${trimestre}/${anno}`);
    
    // Debug: mostra quali tipi_contratto esistono nel DB
    const debugTipi = db.exec("SELECT DISTINCT tipo_contratto FROM soglie_usura LIMIT 5");
    if (debugTipi.length > 0) {
      console.log(' Tipi contratto nel DB:', debugTipi[0].values.flat());
    }
    
    return null;
  } catch (err) {
    console.error('❌ Errore get_soglia_db:', err);
    return null;
  }
}

function calcola_soglia_moratori(tasso_soglia, db) {
  if (!tasso_soglia) return 0;
  return tasso_soglia + 0.02;
}

module.exports = { get_soglia_db, calcola_soglia_moratori };
