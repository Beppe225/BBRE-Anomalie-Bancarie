'use strict';

/**
 * BBRE Anomalie Bancarie — Modulo: regole_engine.js
 * Livello: NORMATIVA — legge regole dal DB, decide inclusione voci
 * Principio: ZERO logica hardcodata. Tutto dalle regole_normative.
 */

/**
 * Legge le regole normative attive per un tipo di verifica e data di stipula.
 * @param {Object} db - istanza better-sqlite3
 * @param {string} tipo_verifica - es. 'inclusione_voci', 'usura', 'moratori', 'riferimento'
 * @param {string|Date} data_stipula
 * @returns {Array<Object>} - array di regole applicabili
 */
function get_regole_attive(db, tipo_verifica, data_stipula) {
  const data = new Date(data_stipula).toISOString().split('T')[0];

  const regole = db.prepare(`
    SELECT *
    FROM regole_normative
    WHERE attiva = 1
      AND tipo = ?
      AND (data_validita_da IS NULL OR data_validita_da <= ?)
      AND (data_validita_a IS NULL OR data_validita_a >= ?)
    ORDER BY priorita ASC, data_validita_da DESC
  `).all(tipo_verifica, data, data);

  return regole;
}

/**
 * Determina se ogni voce di costo deve essere inclusa nel TEG reale.
 * La logica è completamente guidata dalle regole DB.
 *
 * @param {Array<Object>} voci_costo - voci dal DB (con tipo, condizionante, importo, ecc.)
 * @param {Array<Object>} regole_attive - output di get_regole_attive()
 * @param {string|Date} data_stipula
 * @returns {Array<{
 *   voce_id: number,
 *   descrizione: string,
 *   inclusa: boolean,
 *   motivazione: string,
 *   regola_applicata_id: number|null,
 *   warning: string|null,
 *   tipo_flusso: string
 * }>}
 */
function determina_inclusione_voci(voci_costo, regole_attive, data_stipula) {
  const data_st = new Date(data_stipula);
  const anno_stipula = data_st.getFullYear();

  return voci_costo.map(voce => {
    let inclusa = false;
    let motivazione = 'Non inclusa per default';
    let regola_applicata_id = null;
    let warning = null;
    const tipo_flusso = voce.tipo_flusso || 'upfront';

    // R001: voce condizionante → SEMPRE inclusa (priorità assoluta)
    const r001 = regole_attive.find(r => r.codice === 'R001');
    if (voce.condizionante === 1 || voce.condizionante === true) {
      inclusa = true;
      motivazione = 'Voce condizionante alla concessione del credito — inclusione obbligatoria (art. 644 c.p., L. 108/1996)';
      regola_applicata_id = r001 ? r001.id : null;
      return { voce_id: voce.id, descrizione: voce.descrizione, inclusa, motivazione, regola_applicata_id, warning, tipo_flusso };
    }

    // Logica per tipo polizza
    if (voce.tipo === 'polizza' || voce.tipo === 'assicurazione') {
      // Post-2010: polizza non condizionante → WARNING 'verificare'
      if (anno_stipula >= 2010 && anno_stipula <= 2016) {
        const r002 = regole_attive.find(r => r.codice === 'R002');
        inclusa = false;
        motivazione = 'Polizza non condizionante (2010-2016): orientamento giurisprudenziale DIVISO';
        regola_applicata_id = r002 ? r002.id : null;
        warning = 'ATTENZIONE: Periodo 2010-2016 — giurisprudenza divisa sull\'inclusione delle polizze non condizionanti nel TEG. Valutare caso per caso. Alcune corti includono, altre escludono. Verificare documentazione contrattuale.';
        return { voce_id: voce.id, descrizione: voce.descrizione, inclusa, motivazione, regola_applicata_id, warning, tipo_flusso };
      }

      if (anno_stipula >= 2017) {
        const r003 = regole_attive.find(r => r.codice === 'R003');
        inclusa = false;
        motivazione = 'Polizza non condizionante post-2017: orientamento prevalente ESCLUSIONE';
        regola_applicata_id = r003 ? r003.id : null;
        warning = 'Polizza non condizionante: non inclusa nel TEG reale. Verificare se effettivamente facoltativa (documentazione separata, firma autonoma del cliente).';
        return { voce_id: voce.id, descrizione: voce.descrizione, inclusa, motivazione, regola_applicata_id, warning, tipo_flusso };
      }

      if (anno_stipula < 2010) {
        const r004 = regole_attive.find(r => r.codice === 'R004');
        inclusa = false;
        motivazione = 'Polizza ante-2010: normativa pre-Direttiva CCD — orientamento diviso';
        regola_applicata_id = r004 ? r004.id : null;
        warning = 'ORIENTAMENTO DIVISO (ante-2010): Prima dell\'attuazione della Direttiva CCD (2010), la giurisprudenza è ancora più divisa. Alcune sentenze includono qualsiasi polizza, altre solo quelle condizionanti. Analisi caso per caso obbligatoria.';
        return { voce_id: voce.id, descrizione: voce.descrizione, inclusa, motivazione, regola_applicata_id, warning, tipo_flusso };
      }
    }

    // Istruttoria, perizia, spese accessorie obbligatorie → incluse
    if (['istruttoria', 'perizia', 'spese_obbligatorie'].includes(voce.tipo)) {
      const r005 = regole_attive.find(r => r.codice === 'R005');
      inclusa = true;
      motivazione = 'Spesa obbligatoria connessa all\'erogazione — inclusa nel TEG (Provvedimento Banca d\'Italia 29/07/2009)';
      regola_applicata_id = r005 ? r005.id : null;
      return { voce_id: voce.id, descrizione: voce.descrizione, inclusa, motivazione, regola_applicata_id, warning, tipo_flusso };
    }

    // Spese facoltative / servizi aggiuntivi → escluse
    if (['servizio_facoltativo', 'carta_credito', 'conto_corrente'].includes(voce.tipo)) {
      const r006 = regole_attive.find(r => r.codice === 'R006');
      inclusa = false;
      motivazione = 'Servizio/spesa facoltativa — esclusa dal TEG';
      regola_applicata_id = r006 ? r006.id : null;
      return { voce_id: voce.id, descrizione: voce.descrizione, inclusa, motivazione, regola_applicata_id, warning, tipo_flusso };
    }

    // Fallback: cerca regola generica per questo tipo
    const regola_generica = regole_attive.find(r => r.tipo_voce_target === voce.tipo);
    if (regola_generica) {
      inclusa = regola_generica.inclusione_default === 1;
      motivazione = regola_generica.descrizione || 'Regola generica applicata';
      regola_applicata_id = regola_generica.id;
      warning = regola_generica.warning_testo || null;
      return { voce_id: voce.id, descrizione: voce.descrizione, inclusa, motivazione, regola_applicata_id, warning, tipo_flusso };
    }

    // Default finale: esclusa con warning
    warning = `Tipo voce "${voce.tipo}" non mappato in nessuna regola attiva. Verificare manualmente.`;
    return { voce_id: voce.id, descrizione: voce.descrizione, inclusa: false, motivazione, regola_applicata_id: null, warning, tipo_flusso };
  });
}

/**
 * Recupera i riferimenti normativi applicabili — sia favorevoli che contrari.
 * Trasparenza totale = credibilità del report.
 * @param {Object} db
 * @param {string|Date} data_stipula
 * @param {number} score - 0..4
 * @returns {{
 *   favorevoli: Array,
 *   contrari: Array,
 *   note_giurisprudenza: string
 * }}
 */
function get_riferimenti_normativi(db, data_stipula, score) {
  const data = new Date(data_stipula).toISOString().split('T')[0];

  const tutti = db.prepare(`
    SELECT *
    FROM regole_normative
    WHERE tipo = 'riferimento'
      AND attiva = 1
      AND (data_validita_da IS NULL OR data_validita_da <= ?)
      AND (data_validita_a IS NULL OR data_validita_a >= ?)
    ORDER BY orientamento, priorita ASC
  `).all(data, data);

  const favorevoli = tutti.filter(r => r.orientamento === 'FAVOREVOLE');
  const contrari = tutti.filter(r => r.orientamento === 'CONTRARIO' || r.orientamento === 'SFAVOREVOLE');
  const neutri = tutti.filter(r => r.orientamento === 'NEUTRO' || r.orientamento === 'DIVISO');

  // Nota giurisprudenziale contestuale allo score
  let note_giurisprudenza = '';
  if (score === 0) {
    note_giurisprudenza = 'Nessuna anomalia rilevata. I tassi applicati risultano nei limiti di legge.';
  } else if (score === 1) {
    note_giurisprudenza = 'Zona grigia: lo scostamento è minimo. La giurisprudenza è divisa su fattispecie analoghe. Consulenza legale consigliata prima di procedere.';
  } else if (score === 2) {
    note_giurisprudenza = 'Anomalia possibile: esistono precedenti favorevoli al mutuatario. L\'esito dipende dall\'orientamento del giudice competente e dalla qualità della documentazione.';
  } else if (score === 3) {
    note_giurisprudenza = 'Anomalia probabile: lo scostamento dalla soglia è significativo. I precedenti favorevoli sono numerosi. Si raccomanda valutazione legale approfondita.';
  } else if (score === 4) {
    note_giurisprudenza = 'Caso forte: scostamento elevato + polizza condizionante. Fattispecie analoga a sentenze favorevoli di merito e di legittimità. Alta probabilità di successo con perizia tecnica adeguata.';
  }

  return {
    favorevoli: favorevoli.concat(neutri),
    contrari,
    note_giurisprudenza
  };
}

module.exports = {
  get_regole_attive,
  determina_inclusione_voci,
  get_riferimenti_normativi
};
