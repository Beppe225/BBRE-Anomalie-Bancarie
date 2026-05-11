/**
 * BBRE Calcolatore Soglie
 * Interfaccia tra Engine e Database
 */

function get_soglia_db(db, data_stipula_iso, tipo_contratto, capitale) {
  try {
    const dataStipula = new Date(data_stipula_iso);
    const anno = dataStipula.getFullYear();
    // Calcolo trimestre (1-4)
    const mese = dataStipula.getMonth() + 1;
    const trimestre = Math.ceil(mese / 3);

    // 1. Tentativo: Ricerca record esatto
    // Nota: assumiamo che 'categoria' nel DB sia normalizzata (es. 'mutuo_ipotecario')
    const queryEsatto = `
      SELECT tegm, tasso_soglia 
      FROM soglie_usura 
      WHERE anno = ? AND trimestre = ? AND tipo_contratto = ? 
      LIMIT 1
    `;
    const resEsatto = db.exec(queryEsatto, [anno, trimestre, tipo_contratto]);

    if (resEsatto.length > 0 && resEsatto[0].values.length > 0) {
      const row = resEsatto[0].values[0];
      return {
        trovato: true,
        tegm: row[0],
        soglia: row[1],
        fonte: 'Dato Ufficiale Esatto',
        warning: null
      };
    }

    // 2. Fallback: Trimestre precedente
    let annoPrec = anno;
    let trimPrec = trimestre - 1;
    
    if (trimPrec <= 0) {
      trimPrec = 4;
      annoPrec = anno - 1;
    }

    const queryFallback = `
      SELECT tegm, tasso_soglia 
      FROM soglie_usura 
      WHERE anno = ? AND trimestre = ? AND tipo_contratto = ? 
      LIMIT 1
    `;
    const resFallback = db.exec(queryFallback, [annoPrec, trimPrec, tipo_contratto]);

    if (resFallback.length > 0 && resFallback[0].values.length > 0) {
      const row = resFallback[0].values[0];
      return {
        trovato: true,
        tegm: row[0],
        soglia: row[1],
        fonte: `Fallback (Trimestre ${trimPrec}/${annoPrec})`,
        warning: 'Utilizzato dato trimestre precedente per mancanza dati ufficiali.'
      };
    }

    // 3. Nessun dato trovato
    return {
      trovato: false,
      tegm: null,
      soglia: null,
      fonte: 'Nessun dato',
      warning: 'Soglia non trovata nel database storico né nei fallback.'
    };

  } catch (err) {
    console.error('Errore in get_soglia_db:', err);
    return { trovato: false, errore: err.message };
  }
}

/**
 * Calcola il tasso soglia per i moratori
 * Legge la regola dal DB (es. R004)
 */
function calcola_soglia_moratori(db, tasso_soglia_usura) {
  try {
    // Cerca regola R004 (Tasso mora)
    const res = db.exec("SELECT parametri FROM regole_normative WHERE codice_regola = 'R004' AND attiva = 1 LIMIT 1");
    
    if (res.length === 0 || res[0].values.length === 0) {
      // Default legale se regola manca: Soglia + 2%
      return { tasso_mora: tasso_soglia_usura + 0.02, fonte: 'Default Legge' };
    }

    const params = JSON.parse(res[0].values[0][0]);
    const delta = params.delta || 0.02;
    const max = params.max || 0.08;

    let tassoCalcolato = tasso_soglia_usura + delta;
    
    // Cap al max legale
    if (tassoCalcolato > tasso_soglia_usura + max) {
      tassoCalcolato = tasso_soglia_usura + max;
    }

    return {
      tasso_mora: tassoCalcolato,
      fonte: 'Regola R004 (DB)',
      parametri: params
    };

  } catch (err) {
    return { errore: err.message };
  }
}

module.exports = { get_soglia_db, calcola_soglia_moratori };
