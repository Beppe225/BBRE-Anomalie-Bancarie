const crypto = require('crypto');
const { calcola_irr } = require('./math/irr_teg');
const { get_soglia_db, calcola_soglia_moratori } = require('./math/soglia_calculator');
const { applica_regole } = require('./normativa/regole_engine');
const { calcola_score } = require('./normativa/score_engine');

async function esegui_analisi(db, input) {
  console.log('🏁 [Orchestrator] Avvio analisi per:', input.contratto_id);
  
  try {
    if (!input.capitale || !input.data_stipula || !input.voci) {
      throw new Error('Dati contratto incompleti');
    }

    // 1. Applica Regole
    const regoleRisultato = applica_regole(db, input.voci);
    const costiFiltrati = regoleRisultato.voci_processate.filter(v => v.inclusa_teg);
    const totCosti = costiFiltrati.reduce((acc, v) => acc + v.importo, 0);
    const nettoErogato = input.capitale - totCosti;
    
    // 2. Recupera Soglia
    const sogliaRes = get_soglia_db(db, input.data_stipula, input.tipo_contratto, input.capitale);
    
    // 3. Simula flussi (12 rate mensili)
    const tan = input.tan_dichiarato || 0.07;
    const rataMensile = (input.capitale * tan / 12) / (1 - Math.pow(1 + tan / 12, -12));
    const flussi = [-nettoErogato];
    const date = [input.data_stipula];
    for (let i = 1; i <= 12; i++) {
      flussi.push(rataMensile);
      const d = new Date(input.data_stipula);
      d.setMonth(d.getMonth() + i);
      date.push(d.toISOString());
    }

    // 4. Calcola IRR
    const irrRisultato = calcola_irr(flussi, date, tan);
    if (!irrRisultato.convergenza) throw new Error('IRR non convergente');

    // 5. Calcola Score
    // ✅ FIX: Converti soglia da percentuale a decimale per confronto con IRR (es. 8.56 -> 0.0856)
    const sogliaDecimale = (sogliaRes.soglia || 0) / 100;
    
    const scoreRes = calcola_score(irrRisultato.irr_annuale, sogliaDecimale, {
      data_stipula: input.data_stipula,
      tipo: input.tipo_contratto,
      has_polizza_non_obbligatoria: costiFiltrati.some(v => v.voce.toLowerCase().includes('polizza')),
      moratori_eccessivi: false,
      dati_completi: true
    });

    // 6. Audit
    const hashString = JSON.stringify({
      input: input.contratto_id,
      teg: irrRisultato.irr_annuale,
      soglia: sogliaRes.soglia,
      score: scoreRes.score
    });
    const hash_catena = crypto.createHash('sha256').update(hashString).digest('hex');

    try {
      const stmt = db.prepare(`INSERT INTO audit_analisi (analisi_id, hash_catena, versione_engine, dataset_soglie, timestamp_analisi, output_hash) VALUES (?, ?, ?, ?, ?, ?)`);
      stmt.run(input.contratto_id, hash_catena, '1.0.0', sogliaRes.fonte || 'N/A', new Date().toISOString(), crypto.createHash('sha256').update(JSON.stringify(scoreRes)).digest('hex'));
      db.run("COMMIT");
    } catch (dbErr) { console.warn('️ Errore audit:', dbErr.message); }

    // 7. Return
    return {
      teg: irrRisultato.irr_annuale,
      soglia: sogliaRes.soglia || 0, // Ritorna come percentuale per la UI
      score: scoreRes.score,
      descrizione_score: scoreRes.descrizione,
      fattori: scoreRes.fattori,
      affidabilita: scoreRes.affidabilita,
      orientamento_giurisp: scoreRes.orientamento_giurisp,
      hash_catena: hash_catena
    };

  } catch (err) {
    console.error('❌ [Orchestrator] Errore:', err);
    throw err;
  }
}

module.exports = { esegui_analisi };
