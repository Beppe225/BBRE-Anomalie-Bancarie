'use strict';

/**
 * BBRE Anomalie Bancarie — Modulo: soglia_calculator.js
 * Livello: MATEMATICA + lettura DB soglie (read-only)
 * Nessuna logica normativa qui — solo recupero dati e calcoli soglia.
 */

/**
 * Determina il trimestre di appartenenza di una data.
 * @param {string|Date} data
 * @returns {{anno: number, trimestre: number}} - trimestre 1..4
 */
function get_trimestre(data) {
  const d = new Date(data);
  const mese = d.getMonth() + 1; // 1..12
  const trimestre = Math.ceil(mese / 3);
  return { anno: d.getFullYear(), trimestre };
}

/**
 * Legge la soglia usura dal DB per un dato contratto.
 * @param {Object} db - istanza better-sqlite3
 * @param {string|Date} data_stipula
 * @param {string} tipo_contratto - es. 'mutuo_ipotecario', 'prestito_personale', 'cessione_quinto'
 * @param {number} capitale - importo in euro
 * @returns {{
 *   tegm: number,
 *   tasso_soglia: number,
 *   formula: string,
 *   fonte_gazzetta: string,
 *   data_inizio: string,
 *   data_fine: string,
 *   versione_dataset: string,
 *   trovato: boolean,
 *   note: string|null
 * }}
 */
function get_soglia_db(db, data_stipula, tipo_contratto, capitale) {
  const { anno, trimestre } = get_trimestre(data_stipula);

  // Query principale: cerca per trimestre, tipo e classe importo
  // La tabella soglie_usura ha: anno, trimestre, tipo_contratto, classe_importo_min,
  // classe_importo_max, tegm, tasso_soglia, formula, fonte_gazzetta,
  // data_inizio, data_fine, versione_dataset
  let soglia = db.prepare(`
    SELECT *
    FROM soglie_usura
    WHERE anno = ?
      AND trimestre = ?
      AND tipo_contratto = ?
      AND (classe_importo_min IS NULL OR classe_importo_min <= ?)
      AND (classe_importo_max IS NULL OR classe_importo_max > ?)
    ORDER BY
      CASE WHEN classe_importo_min IS NOT NULL THEN 0 ELSE 1 END,
      classe_importo_min DESC
    LIMIT 1
  `).get(anno, trimestre, tipo_contratto, capitale, capitale);

  if (!soglia) {
    // Fallback: cerca senza classe importo (alcune categorie non hanno classi)
    soglia = db.prepare(`
      SELECT *
      FROM soglie_usura
      WHERE anno = ?
        AND trimestre = ?
        AND tipo_contratto = ?
      ORDER BY data_inizio DESC
      LIMIT 1
    `).get(anno, trimestre, tipo_contratto);
  }

  if (!soglia) {
    // Fallback finale: cerca il trimestre più vicino precedente disponibile
    soglia = db.prepare(`
      SELECT *
      FROM soglie_usura
      WHERE tipo_contratto = ?
        AND (anno < ? OR (anno = ? AND trimestre < ?))
      ORDER BY anno DESC, trimestre DESC
      LIMIT 1
    `).get(tipo_contratto, anno, anno, trimestre);
  }

  if (!soglia) {
    return {
      tegm: null,
      tasso_soglia: null,
      formula: null,
      fonte_gazzetta: null,
      data_inizio: null,
      data_fine: null,
      versione_dataset: null,
      trovato: false,
      note: `Nessuna soglia trovata per: ${tipo_contratto}, ${anno}T${trimestre}, €${capitale}`
    };
  }

  return {
    tegm: soglia.tegm,
    tasso_soglia: soglia.tasso_soglia,
    formula: soglia.formula || 'TEGM × 1.25 + 4pp (L. 108/1996 post-2011)',
    fonte_gazzetta: soglia.fonte_gazzetta,
    data_inizio: soglia.data_inizio,
    data_fine: soglia.data_fine,
    versione_dataset: soglia.versione_dataset || '1.0',
    trovato: true,
    note: soglia.note || null
  };
}

/**
 * Calcola la soglia per i tassi moratori.
 * Normativa: Cass. SS.UU. 19597/2020 + Circolare Banca d'Italia
 * La soglia moratori = soglia corrente + delta (default 2.1pp).
 * @param {number} tasso_soglia - soglia usura base (%)
 * @param {Object} db - istanza better-sqlite3
 * @returns {{soglia_moratori: number, delta_applicato: number, fonte_regola: string}}
 */
function calcola_soglia_moratori(tasso_soglia, db) {
  // Legge delta moratori da regole_normative
  let delta_moratori = 2.1; // default Banca d'Italia
  let fonte_regola = 'Default Banca d\'Italia — Circolare 2003';

  try {
    const regola = db.prepare(`
      SELECT valore_numerico, fonte, descrizione
      FROM regole_normative
      WHERE codice = 'DELTA_MORATORI'
        AND attiva = 1
      ORDER BY data_validita_da DESC
      LIMIT 1
    `).get();

    if (regola && regola.valore_numerico !== null) {
      delta_moratori = regola.valore_numerico;
      fonte_regola = regola.fonte || fonte_regola;
    }
  } catch (e) {
    // DB non disponibile o tabella non ancora popolata: usa default
  }

  const soglia_moratori = parseFloat((tasso_soglia + delta_moratori).toFixed(4));

  return {
    soglia_moratori,
    delta_applicato: delta_moratori,
    fonte_regola
  };
}

/**
 * Utility: determina la categoria Banca d'Italia dal tipo contratto.
 * Usato per logging e report.
 * @param {string} tipo_contratto
 * @returns {string}
 */
function get_categoria_bankitalia(tipo_contratto) {
  const mappa = {
    'mutuo_ipotecario': 'Mutui ipotecari a tasso fisso / variabile',
    'prestito_personale': 'Credito personale',
    'cessione_quinto': 'Cessione del quinto dello stipendio e della pensione',
    'credito_revolving': 'Aperture di credito in c/c — oltre 5.000 €',
    'leasing_immobiliare': 'Leasing immobiliare',
    'leasing_strumentale': 'Leasing strumentale e auto',
    'factoring': 'Factoring',
    'altri_finanziamenti': 'Altri finanziamenti alle famiglie e alle imprese'
  };
  return mappa[tipo_contratto] || tipo_contratto;
}

module.exports = {
  get_soglia_db,
  calcola_soglia_moratori,
  get_trimestre,
  get_categoria_bankitalia
};
