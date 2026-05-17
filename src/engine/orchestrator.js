/**
 * orchestrator.js - Coordinatore analisi completa v1.3.0
 * Sessione H: Moratori | Fix: polizza_condizionante truthy check
 */

const { calcola_irr }               = require('./math/irr_teg');
const { get_soglia_db }             = require('./math/soglia_calculator');
const { determina_inclusione_voci } = require('./normativa/regole_engine');
const { calcola_score }             = require('./normativa/score_engine');
const { analizza_anatocismo }       = require('./normativa/anatocismo_engine');
const { analizza_moratori }         = require('./normativa/moratori_engine');
const crypto                        = require('crypto');

async function esegui_analisi(db, payload) {
  console.log('🏁 [Orchestrator v1.3.0] Avvio analisi...');

  const {
    contratto_id, tipo_contratto, data_stipula,
    capitale, tan_dichiarato, voci, durata_mesi
  } = payload;

  try {
    // Step 1: Determina inclusione voci
    console.log('📋 Step 1: Applicazione regole normative...');
    const voci_analizzate = determina_inclusione_voci(db, voci, tipo_contratto);

    // Step 2: Costruisci flussi di cassa
    console.log('📊 Step 2: Costruzione flussi di cassa...');
    const voci_incluse  = voci_analizzate.filter(v => v.inclusa_teg);
    const totale_costi  = voci_incluse.reduce((sum, v) => sum + v.importo, 0);
    const numero_rate   = durata_mesi || 84;
    const tasso_mensile = tan_dichiarato / 12;
    const rata          = tan_dichiarato > 0
      ? (capitale * tasso_mensile) / (1 - Math.pow(1 + tasso_mensile, -numero_rate))
      : capitale / numero_rate;

    const flussi = [-(capitale - totale_costi)];
    for (let i = 0; i < numero_rate; i++) flussi.push(rata);

    console.log(`  Capitale: €${capitale} | Costi TEG: €${totale_costi} | Rate: ${numero_rate} | Rata: €${rata.toFixed(2)}`);

    // Step 3: Calcola IRR/TEG
    console.log('🧮 Step 3: Calcolo IRR...');
    const irr_result = calcola_irr(flussi, tan_dichiarato);
    console.log(`  TEG: ${(irr_result.irr_annuale * 100).toFixed(4)}%`);

    // Step 4: Recupera soglia usura
    console.log('📏 Step 4: Recupero soglia usura...');
    const soglia_record = get_soglia_db(db, data_stipula, tipo_contratto);

    let soglia_decimale = 0;
    if (soglia_record) {
      const raw = soglia_record.tasso_soglia;
      soglia_decimale = raw > 1 ? raw / 100 : raw;
      console.log(`  Soglia trovata: ${raw}% → ${soglia_decimale} decimale`);
    } else {
      console.warn('⚠️ Soglia NON trovata nel DB!');
    }

    // Step 5: Rileva polizza condizionante
    // Fix v1.3.0: usa !!v.inclusa_teg (truthy) invece di === true (strict)
    const ha_polizza_condizionante = voci.some(v =>
      !!v.inclusa_teg &&
      typeof v.voce === 'string' &&
      (v.voce.toLowerCase().includes('polizza') || v.voce.toLowerCase().includes('assicurazione'))
    );
    console.log(`  Polizza condizionante: ${ha_polizza_condizionante}`);

    // Step 6: Calcola score
    console.log('📈 Step 6: Calcolo score...');
    const score_result = calcola_score(irr_result.irr_annuale, soglia_decimale, {
      polizza_condizionante: ha_polizza_condizionante,
      data_stipula,
      tipo_contratto,
      completezza: 'alta'
    });
    console.log(`  Score: ${score_result.score}/4 | Label: ${score_result.label}`);

    // Step 7: Anatocismo (solo ammortamento francese)
    let risultato_anatocismo = null;
    const ammortamento_tipo = (payload.ammortamento || 'francese').toLowerCase();
    if (ammortamento_tipo === 'francese' || ammortamento_tipo === '') {
      console.log('🏦 Step 7: Analisi anatocismo...');
      try {
        risultato_anatocismo = analizza_anatocismo(
          db,
          { ...payload, tan_dichiarato },
          payload.rate_reali || []
        );
        console.log(`  Score Anatocismo: ${risultato_anatocismo.score_anatocismo}/3 | Delta: €${risultato_anatocismo.delta_euro.toFixed(2)}`);
      } catch (anatErr) {
        console.warn('⚠️ Anatocismo non calcolato:', anatErr.message);
      }
    }

    // Step 7b: Moratori (Sessione H)
    let risultato_moratori = null;
    if (payload.mora_contrattuale_perc != null && payload.mora_contrattuale_perc !== '') {
      console.log('⚖️ Step 7b: Analisi moratori...');
      try {
        risultato_moratori = analizza_moratori(db, payload, irr_result.irr_annuale, soglia_decimale);
        console.log(`  Score Moratori: ${risultato_moratori.score_moratori}/3 | Sopra soglia: ${risultato_moratori.supera_soglia_mora}`);
        // Propaga in fattore F5 se anomalia significativa
        if (risultato_moratori.applicabile && risultato_moratori.score_moratori >= 2 && score_result.fattori[4]) {
          score_result.fattori[4].valore_label = `SÌ (mora ${risultato_moratori.mora_contrattuale_perc.toFixed(2)}% > soglia ${risultato_moratori.soglia_mora_perc.toFixed(2)}%)`;
          score_result.fattori[4].impatto = 'Alto';
        }
      } catch (morErr) {
        console.warn('⚠️ Moratori non calcolati:', morErr.message);
      }
    }

    // Step 8: Hash audit
    const hash_input  = JSON.stringify({ contratto_id, tipo_contratto, capitale, tan_dichiarato, voci, timestamp: Date.now() });
    const hash_catena = crypto.createHash('sha256').update(hash_input).digest('hex');

    // Step 9: Salva audit con migrazione non-destructive
    try {
      const colCheck = db.exec('PRAGMA table_info(audit_analisi)');
      const colNames = colCheck.length > 0 ? colCheck[0].values.map(r => r[1]) : [];
      const nuoveCols = [
        ['tipo_contratto',          'TEXT'],    ['data_stipula',          'TEXT'],
        ['capitale',                'REAL'],    ['tan_dichiarato',        'REAL'],
        ['durata_mesi',             'INTEGER'], ['teg_reale',             'REAL'],
        ['soglia_usura',            'REAL'],    ['score_finale',          'INTEGER'],
        ['usura_rilevata',          'INTEGER'], ['fattori_json',          'TEXT'],
        ['voci_json',               'TEXT'],    ['anatocismo_json',       'TEXT'],
        ['moratori_json',           'TEXT'],    ['mora_contrattuale_perc','REAL']
      ];
      for (const [col, tipo] of nuoveCols) {
        if (!colNames.includes(col)) {
          try { db.run(`ALTER TABLE audit_analisi ADD COLUMN ${col} ${tipo}`); } catch (_) {}
        }
      }

      const fattori_json    = JSON.stringify(score_result.fattori || []);
      const voci_json       = JSON.stringify(voci || []);
      const anatocismo_json = risultato_anatocismo ? JSON.stringify(risultato_anatocismo) : null;
      const moratori_json   = risultato_moratori   ? JSON.stringify(risultato_moratori)   : null;
      const usura_int       = (score_result.score >= 3) ? 1 : 0;
      const tan_dec         = typeof tan_dichiarato === 'number' ? tan_dichiarato : parseFloat(tan_dichiarato);
      const mora_val        = payload.mora_contrattuale_perc != null ? parseFloat(payload.mora_contrattuale_perc) : null;

      db.run(
        `INSERT OR REPLACE INTO audit_analisi
         (analisi_id, contratto_id, hash_catena, versione_engine, dataset_soglie, timestamp_analisi,
          tipo_contratto, data_stipula, capitale, tan_dichiarato, durata_mesi,
          teg_reale, soglia_usura, score_finale, usura_rilevata,
          fattori_json, voci_json, anatocismo_json, moratori_json, mora_contrattuale_perc)
         VALUES (?,?,?,'1.3.0','seed_v2',datetime('now'),?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [contratto_id, contratto_id, hash_catena,
         tipo_contratto, data_stipula || null, capitale, tan_dec, parseInt(durata_mesi) || 84,
         irr_result.irr_annuale, soglia_decimale, score_result.score, usura_int,
         fattori_json, voci_json, anatocismo_json, moratori_json, mora_val]
      );
      console.log('  ✅ Audit salvato con dati archivio');
    } catch (dbErr) {
      console.error('❌ Errore audit:', dbErr.message);
    }

    return {
      contratto_id,
      teg:                  irr_result.irr_annuale,
      soglia:               soglia_decimale,
      score:                score_result.score,
      label:                score_result.label,
      fattori:              score_result.fattori,
      affidabilita:         score_result.affidabilita,
      orientamento_giurisp: score_result.orientamento_giurisp,
      delta_pp:             score_result.delta_pp,
      hash_catena,
      convergenza_irr:      irr_result.convergenza,
      metodo_irr:           irr_result.metodo_usato,
      iterazioni_irr:       irr_result.iterazioni,
      voci_analizzate,
      totale_costi_inclusi: totale_costi,
      ha_polizza_condizionante,
      anatocismo:           risultato_anatocismo,
      moratori:             risultato_moratori
    };

  } catch (err) {
    console.error('❌ Errore orchestrator:', err);
    throw err;
  }
}

module.exports = { esegui_analisi };
