/**
 * orchestrator.js - Coordinatore analisi completa v1.2
 * Fix: polizza_condizionante, soglia normalizzata, durata_mesi
 */

const { calcola_irr } = require('./math/irr_teg');
const { get_soglia_db } = require('./math/soglia_calculator');
const { determina_inclusione_voci } = require('./normativa/regole_engine');
const { calcola_score } = require('./normativa/score_engine');
const { analizza_anatocismo } = require('./normativa/anatocismo_engine');
const crypto = require('crypto');

async function esegui_analisi(db, payload) {
  console.log('🏁 [Orchestrator] Avvio analisi...');

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
    const voci_incluse   = voci_analizzate.filter(v => v.inclusa_teg);
    const totale_costi   = voci_incluse.reduce((sum, v) => sum + v.importo, 0);
    const numero_rate    = durata_mesi || 84;
    const tasso_mensile  = tan_dichiarato / 12;
    const rata           = tan_dichiarato > 0
      ? (capitale * tasso_mensile) / (1 - Math.pow(1 + tasso_mensile, -numero_rate))
      : capitale / numero_rate;

    // Flusso iniziale: netto erogato (capitale - costi anticipati)
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
    
    // Normalizza soglia: il DB la salva in % (es. 6.25), convertiamo in decimale (0.0625)
    let soglia_decimale = 0;
    if (soglia_record) {
      const raw = soglia_record.tasso_soglia;
      soglia_decimale = raw > 1 ? raw / 100 : raw;
      console.log(`  Soglia trovata: ${raw}% → ${soglia_decimale} decimale`);
    } else {
      console.warn('⚠️ Soglia NON trovata nel DB!');
    }

    // Step 5: Rileva polizza condizionante
    // Una polizza è condizionante se è inclusa nel TEG (= obbligatoria per ottenere il credito)
    const ha_polizza_condizionante = voci.some(v =>
      v.inclusa_teg === true &&
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

    // Step 7: Anatocismo (opzionale — solo ammortamento francese)
    let risultato_anatocismo = null;
    const ammortamento_tipo = (payload.ammortamento || 'francese').toLowerCase();
    if (ammortamento_tipo === 'francese' || ammortamento_tipo === '') {
      console.log('🏦 Step 7: Analisi anatocismo (ammortamento francese)...');
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

    // Step 8: Hash audit
    const hash_input  = JSON.stringify({ contratto_id, tipo_contratto, capitale, tan_dichiarato, voci, timestamp: Date.now() });
    const hash_catena = crypto.createHash('sha256').update(hash_input).digest('hex');

    // Step 8: Salva audit
    try {
      db.run(`
        INSERT OR REPLACE INTO audit_analisi
        (analisi_id, contratto_id, hash_catena, versione_engine, dataset_soglie, timestamp_analisi)
        VALUES ('${contratto_id}', '${contratto_id}', '${hash_catena}', '1.2.0', 'seed_v2', datetime('now'))
      `);
      console.log('  ✅ Audit salvato');
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
      anatocismo:           risultato_anatocismo
    };

  } catch (err) {
    console.error('❌ Errore orchestrator:', err);
    throw err;
  }
}

module.exports = { esegui_analisi };