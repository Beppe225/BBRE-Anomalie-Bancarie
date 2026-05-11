/**
 * soglia_calculator.js - Recupero soglie usura da DB
 */

function get_soglia_db(db, data_stipula, tipo_contratto) {
  const date = new Date(data_stipula);
  const anno = date.getFullYear();
  const mese = date.getMonth() + 1;
  const trimestre = Math.ceil(mese / 3);

  // Cerca record esatto
  const stmt = db.prepare(`
    SELECT * FROM soglie_usura 
    WHERE anno = ? AND trimestre = ? AND tipo_contratto = ?
    ORDER BY data_pubblicazione DESC
    LIMIT 1
  `);

  let risultato = stmt.get(anno, trimestre, tipo_contratto);

  if (!risultato) {
    // Fallback: trimestre precedente
    const prevTrimestre = trimestre === 1 ? 4 : trimestre - 1;
    const prevAnno = trimestre === 1 ? anno - 1 : anno;

    risultato = db.prepare(`
      SELECT * FROM soglie_usura 
      WHERE anno = ? AND trimestre = ? AND tipo_contratto = ?
      ORDER BY data_pubblicazione DESC
      LIMIT 1
    `).get(prevAnno, prevTrimestre, tipo_contratto);

    if (risultato) {
      console.warn(`⚠️ Soglia non trovata per Q${trimestre}/${anno}. Usato Q${prevTrimestre}/${prevAnno}`);
    }
  }

  return risultato;
}

function calcola_soglia_moratori(tasso_soglia, db) {
  // Legge delta da regole_normative
  const regola = db.prepare("SELECT parametri FROM regole_normative WHERE codice_regola = 'R004'").get();

  if (!regola) return tasso_soglia;

  const { delta = 0.02, max = 0.08 } = JSON.parse(regola.parametri);

  // Tasso moratori = soglia + delta (max max% oltre soglia)
  let tasso_moratori = tasso_soglia + delta;
  const incremento_max = tasso_soglia * max;

  if (tasso_moratori - tasso_soglia > incremento_max) {
    tasso_moratori = tasso_soglia + incremento_max;
  }

  return tasso_moratori;
}

module.exports = { get_soglia_db, calcola_soglia_moratori };
