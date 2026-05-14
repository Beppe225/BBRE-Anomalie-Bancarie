'use strict';

/**
 * BBRE Anomalie Bancarie — Modulo: orchestrator.js
 * Coordina tutti i moduli dell'engine e persiste i risultati nel DB.
 * È il punto di ingresso unico per eseguire un'analisi completa.
 */

const { calcola_irr, costruisci_flussi, calcola_teg_dichiarato_ricalcolato } = require('./math/irr_calculator');
const { get_soglia_db, calcola_soglia_moratori } = require('./math/soglia_calculator');
const { get_regole_attive, determina_inclusione_voci, get_riferimenti_normativi } = require('./normativa/regole_engine');
const { calcola_score } = require('./normativa/score_engine');

const ENGINE_VERSION = '1.0.0';

/**
 * Calcola il recupero stimato (min e max) in base agli interessi totali pagati.
 * @param {Object} contratto
 * @param {number} score
 * @returns {{recupero_min: number, recupero_max: number, base_calcolo: string}}
 */
function calcola_recupero_stimato(contratto, score) {
  const { capitale_erogato, rata_mensile, durata_mesi } = contratto;

  if (!rata_mensile || !durata_mesi || !capitale_erogato) {
    return { recupero_min: null, recupero_max: null, base_calcolo: 'dati insufficienti' };
  }

  const totale_pagato = rata_mensile * durata_mesi;
  const interessi_totali = totale_pagato - capitale_erogato;

  if (interessi_totali <= 0) {
    return { recupero_min: 0, recupero_max: 0, base_calcolo: 'interessi zero o negativi' };
  }

  // Range: 60% – 100% degli interessi (dipende dalla forza del caso)
  const moltiplicatore_min = score >= 3 ? 0.70 : 0.60;
  const moltiplicatore_max = score >= 3 ? 1.00 : 0.80;

  return {
    recupero_min: Math.round(interessi_totali * moltiplicatore_min),
    recupero_max: Math.round(interessi_totali * moltiplicatore_max),
    base_calcolo: `Interessi totali stimati: €${Math.round(interessi_totali).toLocaleString('it-IT')}`
  };
}

/**
 * Esegue l'analisi completa di un contratto.
 * @param {Object} db - istanza better-sqlite3
 * @param {number} contratto_id
 * @returns {Object} - analisi completa con audit_id
 */
function esegui_analisi(db, contratto_id) {
  const timestamp_inizio = new Date().toISOString();

  // ─── STEP 1: Leggi contratto e voci dal DB ───────────────────────────────
  const contratto = db.prepare(`
    SELECT * FROM contratti WHERE id = ?
  `).get(contratto_id);

  if (!contratto) {
    throw new Error(`Contratto ID ${contratto_id} non trovato nel DB`);
  }

  const voci_costo = db.prepare(`
    SELECT * FROM voci_costo WHERE contratto_id = ? ORDER BY id ASC
  `).all(contratto_id);

  // ─── STEP 2: Regole attive per data stipula ──────────────────────────────
  const regole_attive = get_regole_attive(db, 'inclusione_voci', contratto.data_stipula);

  // ─── STEP 3: Determina inclusione voci ──────────────────────────────────
  const voci_analizzate = determina_inclusione_voci(voci_costo, regole_attive, contratto.data_stipula);
  const voci_incluse = voci_analizzate.filter(v => v.inclusa);
  const voci_escluse = voci_analizzate.filter(v => !v.inclusa);

  // Mappa voci_incluse con i dati completi dalla DB
  const voci_incluse_full = voci_incluse.map(v => {
    const voce_db = voci_costo.find(vc => vc.id === v.voce_id);
    return { ...voce_db, ...v };
  });

  // ─── STEP 4: Costruisci flussi TEG reale ─────────────────────────────────
  const flussi_teg_reale = costruisci_flussi(contratto, voci_incluse_full);

  // ─── STEP 5: Calcola TEG reale ───────────────────────────────────────────
  const irr_reale = calcola_irr(flussi_teg_reale);

  if (!irr_reale.convergenza_ok) {
    throw new Error('Calcolo IRR non convergente per TEG reale. Verificare i dati del contratto.');
  }

  const teg_reale = irr_reale.irr_annuale;

  // ─── STEP 6: TEG dichiarato ricalcolato ─────────────────────────────────
  // Usa solo le voci che la banca dichiara di aver incluso
  const voci_dichiarate_incluse = voci_incluse_full.filter(v =>
    v.inclusa_nel_teg_dichiarato === 1 || v.inclusa_nel_teg_dichiarato === true
  );
  const teg_dichiarato_check = calcola_teg_dichiarato_ricalcolato(contratto, voci_dichiarate_incluse);

  // ─── STEP 7: Soglia usura ─────────────────────────────────────────────────
  const soglia_data = get_soglia_db(
    db,
    contratto.data_stipula,
    contratto.tipo_contratto,
    contratto.capitale_erogato
  );

  // ─── STEP 8: Soglia moratori ─────────────────────────────────────────────
  const moratori_data = calcola_soglia_moratori(
    soglia_data.trovato ? soglia_data.tasso_soglia : 0,
    db
  );

  // Aggiungi teg_moratori se presente nel contratto
  moratori_data.teg_moratori = contratto.tasso_mora || null;

  // ─── STEP 9: Score ────────────────────────────────────────────────────────
  const score_result = calcola_score(
    teg_reale,
    soglia_data,
    contratto.data_stipula,
    voci_analizzate,
    db,
    contratto,
    moratori_data
  );

  // ─── STEP 10: Riferimenti normativi ──────────────────────────────────────
  const riferimenti = get_riferimenti_normativi(db, contratto.data_stipula, score_result.score);

  // ─── STEP 11: Recupero stimato ────────────────────────────────────────────
  const recupero_stimato = calcola_recupero_stimato(contratto, score_result.score);

  // ─── STEP 12: Salva analisi in DB ─────────────────────────────────────────
  const analisi_data = {
    contratto_id,
    engine_version: ENGINE_VERSION,
    teg_reale: teg_reale,
    teg_dichiarato: contratto.teg_dichiarato,
    teg_dichiarato_ricalcolato: teg_dichiarato_check.teg_ricalcolato,
    delta_teg_dichiarato: teg_dichiarato_check.delta_vs_dichiarato,
    tasso_soglia: soglia_data.tasso_soglia,
    soglia_moratori: moratori_data.soglia_moratori,
    tasso_mora: contratto.tasso_mora,
    moratori_in_anomalia: score_result.fattori.find(f => f.codice === 'F5')?.valore ? 1 : 0,
    score: score_result.score,
    score_label: score_result.label,
    affidabilita: score_result.affidabilita,
    orientamento_giurisprudenziale: score_result.orientamento_giurisprudenziale,
    recupero_min: recupero_stimato.recupero_min,
    recupero_max: recupero_stimato.recupero_max,
    in_usura: score_result.in_usura ? 1 : 0,
    delta_percentuale: score_result.delta_percentuale,
    voci_incluse_count: voci_incluse.length,
    voci_escluse_count: voci_escluse.length,
    warnings_count: voci_analizzate.filter(v => v.warning).length,
    data_analisi: timestamp_inizio,
    versione_dataset_soglie: soglia_data.versione_dataset || '1.0'
  };

  const insert_analisi = db.prepare(`
    INSERT INTO analisi (
      contratto_id, engine_version, teg_reale, teg_dichiarato,
      teg_dichiarato_ricalcolato, delta_teg_dichiarato,
      tasso_soglia, soglia_moratori, tasso_mora, moratori_in_anomalia,
      score, score_label, affidabilita, orientamento_giurisprudenziale,
      recupero_min, recupero_max, in_usura, delta_percentuale,
      voci_incluse_count, voci_escluse_count, warnings_count,
      data_analisi, versione_dataset_soglie
    ) VALUES (
      @contratto_id, @engine_version, @teg_reale, @teg_dichiarato,
      @teg_dichiarato_ricalcolato, @delta_teg_dichiarato,
      @tasso_soglia, @soglia_moratori, @tasso_mora, @moratori_in_anomalia,
      @score, @score_label, @affidabilita, @orientamento_giurisprudenziale,
      @recupero_min, @recupero_max, @in_usura, @delta_percentuale,
      @voci_incluse_count, @voci_escluse_count, @warnings_count,
      @data_analisi, @versione_dataset_soglie
    )
  `);

  const analisi_result = insert_analisi.run(analisi_data);
  const analisi_id = analisi_result.lastInsertRowid;

  // ─── STEP 13: Salva audit_analisi (snapshot completo) ────────────────────
  const audit_snapshot = {
    versione_engine: ENGINE_VERSION,
    versione_dataset_soglie: soglia_data.versione_dataset || '1.0',
    regole_applicate: regole_attive.map(r => ({ id: r.id, codice: r.codice, descrizione: r.descrizione })),
    voci_incluse_detail: voci_incluse_full.map(v => ({
      id: v.voce_id || v.id,
      descrizione: v.descrizione,
      importo: v.importo,
      tipo: v.tipo,
      condizionante: v.condizionante,
      motivazione: v.motivazione,
      regola_applicata_id: v.regola_applicata_id
    })),
    voci_escluse_detail: voci_escluse.map(v => ({
      id: v.voce_id,
      descrizione: v.descrizione,
      motivazione: v.motivazione,
      warning: v.warning
    })),
    input_snapshot: {
      contratto: {
        id: contratto.id,
        tipo_contratto: contratto.tipo_contratto,
        capitale_erogato: contratto.capitale_erogato,
        rata_mensile: contratto.rata_mensile,
        durata_mesi: contratto.durata_mesi,
        tan: contratto.tan,
        teg_dichiarato: contratto.teg_dichiarato,
        data_stipula: contratto.data_stipula
      },
      soglia_applicata: {
        tegm: soglia_data.tegm,
        tasso_soglia: soglia_data.tasso_soglia,
        fonte_gazzetta: soglia_data.fonte_gazzetta,
        formula: soglia_data.formula
      }
    },
    fattori_score: score_result.fattori,
    irr_calcolo: {
      irr_mensile: irr_reale.irr_mensile,
      irr_annuale: irr_reale.irr_annuale,
      iterazioni: irr_reale.iterazioni,
      convergenza_ok: irr_reale.convergenza_ok
    },
    timestamp: timestamp_inizio
  };

  const insert_audit = db.prepare(`
    INSERT INTO audit_analisi (
      analisi_id, contratto_id, engine_version, snapshot_json, timestamp
    ) VALUES (?, ?, ?, ?, ?)
  `);

  const audit_result = insert_audit.run(
    analisi_id,
    contratto_id,
    ENGINE_VERSION,
    JSON.stringify(audit_snapshot),
    timestamp_inizio
  );

  const audit_id = audit_result.lastInsertRowid;

  // ─── OUTPUT COMPLETO ──────────────────────────────────────────────────────
  return {
    analisi_id,
    audit_id,
    contratto_id,
    engine_version: ENGINE_VERSION,

    // Risultati principali
    teg_reale,
    teg_dichiarato: contratto.teg_dichiarato,
    teg_dichiarato_ricalcolato: teg_dichiarato_check.teg_ricalcolato,
    delta_teg_dichiarato: teg_dichiarato_check.delta_vs_dichiarato,
    tasso_soglia: soglia_data.tasso_soglia,
    tegm: soglia_data.tegm,
    delta_percentuale: score_result.delta_percentuale,
    in_usura: score_result.in_usura,

    // Moratori
    tasso_mora: contratto.tasso_mora,
    soglia_moratori: moratori_data.soglia_moratori,
    moratori_in_anomalia: score_result.fattori.find(f => f.codice === 'F5')?.valore || false,

    // Score e valutazione
    score: score_result.score,
    score_label: score_result.label,
    affidabilita: score_result.affidabilita,
    orientamento_giurisprudenziale: score_result.orientamento_giurisprudenziale,
    fattori: score_result.fattori,

    // Voci
    voci_incluse: voci_incluse_full,
    voci_escluse,
    warnings: voci_analizzate.filter(v => v.warning),

    // Recupero stimato
    recupero_stimato,

    // Riferimenti normativi
    riferimenti_favorevoli: riferimenti.favorevoli,
    riferimenti_contrari: riferimenti.contrari,
    note_giurisprudenza: riferimenti.note_giurisprudenza,

    // Metadati
    data_analisi: timestamp_inizio,
    soglia_fonte: soglia_data.fonte_gazzetta,
    soglia_formula: soglia_data.formula
  };
}

module.exports = {
  esegui_analisi,
  calcola_recupero_stimato,
  ENGINE_VERSION
};
