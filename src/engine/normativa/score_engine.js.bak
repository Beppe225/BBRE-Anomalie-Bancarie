/**
 * score_engine.js - Calcolo score rischio 0-4
 * FASE 2: Fattori espliciti e deterministici
 */

function calcola_score(teg, soglia, fattori_input) {
  const fattori = [
    { id: 'F1', nome: 'Scostamento Tasso', peso: 0.40, valore: 0 },
    { id: 'F2', nome: 'Polizze', peso: 0.20, valore: 0 },
    { id: 'F3', nome: 'Epoca Contratto', peso: 0.10, valore: 0 },
    { id: 'F4', nome: 'Tipo Contratto', peso: 0.10, valore: 0 },
    { id: 'F5', nome: 'Tassi Moratori', peso: 0.10, valore: 0 },
    { id: 'F6', nome: 'Qualità Dati', peso: 0.10, valore: 0 }
  ];

  // F1: Scostamento tasso (TAEG vs Soglia)
  if (soglia && soglia > 0) {
    const scostamentoPerc = ((teg - soglia) / soglia) * 100;
    // Se TAEG > Soglia, lo scostamento è positivo. Normalizziamo: >100% = 1.0 (massimo rischio)
    // Se TAEG < Soglia, scostamento negativo -> valore 0 (nessun rischio usura)
    fattori[0].valore = Math.min(Math.max(scostamentoPerc / 100, 0), 1);
  }

  // F2: Polizze (semplificato)
  if (fattori_input.polizze_obbligatorie === false) fattori[1].valore = 0.0;
  else fattori[1].valore = 0.5;

  // F3-F6: Valori base (da espandere con logica normativa completa)
  fattori[2].valore = 0.1; // Epoca recente
  fattori[3].valore = 0.1; // Tipo standard
  fattori[4].valore = 0.0; // Moratori ok
  fattori[5].valore = 0.0; // Dati completi

  // Calcolo score pesato
  let scoreWeighted = 0;
  for (const f of fattori) {
    scoreWeighted += f.valore * f.peso;
  }

  const score_finale = Math.round(scoreWeighted * 4);
  const affidabilita = score_finale <= 1 ? 'Alta' : (score_finale <= 2 ? 'Media' : 'Bassa');

  return {
    score: score_finale,
    fattori,
    affidabilita,
    orientamento_giurisp: score_finale <= 1 ? 'Favorevole' : (score_finale <= 2 ? 'Neutro' : 'Contrario')
  };
}

module.exports = { calcola_score };
