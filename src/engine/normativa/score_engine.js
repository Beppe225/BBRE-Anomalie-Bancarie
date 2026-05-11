/**
 * BBRE Score Engine
 * Calcola score 0-4 basato su delta, epoca, polizze, ecc.
 */

function calcola_score(tasso_calcolato, soglia_usura, dettagli_contratto) {
  const delta = tasso_calcolato - soglia_usura;
  
  // FATTORI DI RISCHIO (F1-F6)
  // Ogni fattore ha un peso (weight) e un valore (value 0-1)
  
  // F1: Delta Tasso vs Soglia (Peso alto)
  // Se sotto soglia = 0, se sopra cresce
  let f1_valore = 0;
  if (delta > 0) {
    // Normalizzazione semplice: ogni 1% di scostamento aumenta il rischio
    f1_valore = Math.min(delta * 10, 1); 
  }

  // F2: Polizze condizionate (Peso medio)
  // Se ci sono polizze escluse ma presenti, rischio alto
  const f2_valore = (dettagli_contratto.has_polizza_non_obbligatoria) ? 0.8 : 0;

  // F3: Epoca (Peso basso)
  // Pre-2011 era più severo/men chiaro, Post-2011 formula specifica
  const anno = new Date(dettagli_contratto.data_stipula).getFullYear();
  const f3_valore = (anno < 2011) ? 0.3 : 0.1;

  // F4: Giurisprudenza (Simulato)
  // Se il tipo contratto è "sensibile" (es. cqs)
  const f4_valore = (dettagli_contratto.tipo === 'cqs') ? 0.5 : 0.1;

  // F5: Tassi Moratori
  // Se i moratori superano la soglia di mora (calcolata altrove), rischio extra
  const f5_valore = (dettagli_contratto.moratori_eccessivi) ? 0.6 : 0;

  // F6: Completezza Dati
  // Se mancano dati, l'analisi è meno affidabile ma il rischio potenziale esiste
  const f6_valore = (dettagli_contratto.dati_completi) ? 0 : 0.4;

  // CALCOLO FINALE
  // Formula ponderata
  const score_raw = 
    (f1_valore * 0.4) + // 40% importanza allo scostamento
    (f2_valore * 0.2) +
    (f3_valore * 0.1) +
    (f4_valore * 0.1) +
    (f5_valore * 0.1) +
    (f6_valore * 0.1);

  // Mapping su scala 0-4
  // 0.0 - 0.15 -> Score 0 (Verde)
  // 0.15 - 0.40 -> Score 1 (Giallo)
  // 0.40 - 0.70 -> Score 2 (Arancio)
  // 0.70 - 0.90 -> Score 3 (Rosso)
  // > 0.90     -> Score 4 (Rosso Scuro)
  
  let score_finale = 0;
  let descrizione = "Nessuna anomalia rilevata";

  if (score_raw > 0.90) { score_finale = 4; descrizione = "CASO FORTE - Usura accertata"; }
  else if (score_raw > 0.70) { score_finale = 3; descrizione = "Anomalia Grave"; }
  else if (score_raw > 0.40) { score_finale = 2; descrizione = "Anomalia Moderata"; }
  else if (score_raw > 0.15) { score_finale = 1; descrizione = "Anomalia Lieve / Attenzione"; }
  else { score_finale = 0; descrizione = "Conforme"; }

  // Se sotto soglia, forza score 0 indipendentemente da altri fattori minori
  if (tasso_calcolato <= soglia_usura) {
    score_finale = 0;
    descrizione = "Tasso entro soglia";
  }

  return {
    score: score_finale,
    descrizione: descrizione,
    fattori: [
      { id: 'F1', nome: 'Scostamento Tasso', valore: f1_valore, peso: 0.4 },
      { id: 'F2', nome: 'Polizze', valore: f2_valore, peso: 0.2 },
      { id: 'F3', nome: 'Epoca Contratto', valore: f3_valore, peso: 0.1 },
      { id: 'F4', nome: 'Tipo Contratto', valore: f4_valore, peso: 0.1 },
      { id: 'F5', nome: 'Tassi Moratori', valore: f5_valore, peso: 0.1 },
      { id: 'F6', nome: 'Qualità Dati', valore: f6_valore, peso: 0.1 }
    ],
    affidabilita: dettagli_contratto.dati_completi ? 'Alta' : 'Media',
    orientamento_giurisp: score_finale >= 2 ? 'Favorevole al ricorrente' : 'Neutro'
  };
}

module.exports = { calcola_score };
