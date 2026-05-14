/**
 * orchestrator.js - Coordinatore analisi completa
 * FASE 2: Coordina math, normativa, DB e audit
 */

const { calcola_irr } = require('./math/irr_teg');
const { get_soglia_db, calcola_soglia_moratori } = require('./math/soglia_calculator');
const { determina_inclusione_voci } = require('./normativa/regole_engine');
const { calcola_score } = require('./normativa/score_engine');
const crypto = require('crypto');

async function esegui_analisi(db, payload) {
  console.log('🏁 [Orchestrator] Avvio analisi...');
  console.log('Payload:', JSON.stringify(payload, null, 2));
  
  const { contratto_id, tipo_contratto, data_stipula, capitale, tan_dichiarato, voci } = payload;

  try {
    // Step 1: Determina inclusione voci
    console.log('📋 Step 1: Applicazione regole normative...');
    const voci_analizzate = determina_inclusione_voci(db, voci, tipo_contratto);

    // Step 2: Costruisci flussi di cassa
    console.log('📊 Step 2: Costruzione flussi di cassa...');
    
    // Flusso iniziale: erogazione (negativo per la banca, positivo per il cliente)
    // Ma per IRR convenzionale: capitale erogato è negativo (uscita per banca)
    const flussi = [ -capitale ];
    
    const voci_incluse = voci_analizzate.filter(v => v.inclusa_teg);
    const totale_costi = voci_incluse.reduce((sum, v) => sum + v.importo, 0);
    
    console.log(`  Capitale: € ${capitale.toFixed(2)}`);
    console.log(`  Costi inclusi TEG: € ${totale_costi.toFixed(2)} (${voci_incluse.length} voci)`);
    
    // I costi si sommano all'importo finanziato (riducono il flusso iniziale negativo)
    // Quindi: flussi[0] = -(capitale - costi) = -capitale + costi
    // Ma convenzionalmente: flussi[0] = -capitale, e i costi sono "anticipati"
    // Quindi: flussi[0] = -(capitale - costi)
    flussi[0] = -(capitale - totale_costi);
    
    console.log(`  Flusso iniziale netto: € ${flussi[0].toFixed(2)}`);
    
    // Simula rate (semplificato: 1 anno, 12 rate mensili)
    const numero_rate = payload.durata_mesi || 12;
    const tasso_mensile = tan_dichiarato / 12;
    
    // Calcola rata con ammortamento francese
    const rata = tan_dichiarato > 0 
      ? (capitale * tasso_mensile) / (1 - Math.pow(1 + tasso_mensile, -numero_rate))
      : capitale / numero_rate;

    console.log(`  Rata mensile: € ${rata.toFixed(2)}`);
    
    // Aggiungi rate (positive per la banca, negative per il cliente)
    for (let i = 0; i < numero_rate; i++) {
      flussi.push(rata);
    }

    console.log(`  Flussi totali: ${flussi.length} (${flussi.map(f => f.toFixed(2)).join(', ')})`);

    // Step 3: Calcola IRR/TEG
    console.log('🧮 Step 3: Calcolo IRR...');
    const irr_result = calcola_irr(flussi, tan_dichiarato);
    console.log(`  IRR: ${(irr_result.irr_annuale * 100).toFixed(4)}%`);

    // Step 4: Recupera soglia usura
    console.log('📏 Step 4: Recupero soglia usura...');
    console.log(`  Data: ${data_stipula}, Tipo: ${tipo_contratto}`);
    
    const soglia_record = get_soglia_db(db, data_stipula, tipo_contratto);
    
    if (!soglia_record) {
      console.warn('⚠️ Soglia NON trovata nel DB!');
    } else {
      console.log('✅ Soglia trovata:', soglia_record);
    }
    
    const soglia = soglia_record ? soglia_record.tasso_soglia : 0;
    console.log(`  Valore soglia: ${(soglia * 100).toFixed(4)}%`);

    // Step 5: Calcola score
    console.log('📈 Step 5: Calcolo score...');
    const score_result = calcola_score(irr_result.irr_annuale, soglia, { 
      polizze_obbligatorie: false,
      tipo_contratto,
      data_stipula
    });
    console.log(`  Score: ${score_result.score}/4 (${score_result.affidabilita})`);

    // Step 6: Hash audit
    console.log('🔐 Step 6: Calcolo hash...');
    const hash_input = JSON.stringify({ 
      contratto_id, tipo_contratto, capitale, tan_dichiarato, voci,
      timestamp: Date.now()
    });
    const hash_catena = crypto.createHash('sha256').update(hash_input).digest('hex');

    // Step 7: Salva audit
    console.log('💾 Step 7: Salvataggio audit...');
    try {
      const stmt = db.prepare(`
        INSERT OR REPLACE INTO audit_analisi 
        (analisi_id, contratto_id, hash_catena, versione_engine, dataset_soglie, timestamp_analisi)
        VALUES (?, ?, ?, '1.0.0', 'seed_v1', datetime('now'))
      `);
      stmt.run(contratto_id, contratto_id, hash_catena);
      console.log('  ✅ Audit salvato');
    } catch (dbErr) {
      console.error('❌ Errore audit:', dbErr.message);
    }

    return {
      contratto_id,
      teg: irr_result.irr_annuale,
      soglia,
      score: score_result.score,
      fattori: score_result.fattori,
      affidabilita: score_result.affidabilita,
      orientamento_giurisp: score_result.orientamento_giurisp,
      hash_catena,
      convergenza_irr: irr_result.convergenza,
      metodo_irr: irr_result.metodo_usato,
      iterazioni_irr: irr_result.iterazioni,
      voci_analizzate,
      totale_costi_inclusi: totale_costi
    };

  } catch (err) {
    console.error('❌ Errore orchestrator:', err);
    throw err;
  }
}

module.exports = { esegui_analisi };
