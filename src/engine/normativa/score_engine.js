/**
 * score_engine.js - Calcolo score rischio 0-4
 */

function calcola_score(teg, soglia, fattori_input) {
  // 6 fattori espliciti
  const fattori = [
    { id: 'F1', nome: 'Scostamento Tasso', peso: 0.40, valore: 0 },
    { id: 'F2', nome: 'Polizze', peso: 0.20, valore: 0 },
    { id: 'F3', nome: 'Epoca Contratto', peso: 0.10, valore: 0 },
    { id: 'F4', nome: 'Tipo Contratto', peso: 0.10, valore: 0 },
    { id: 'F5', nome: 'Tassi Moratori', peso: 0.10, valore: 0 },
    { id: 'F6', nome: 'Qualità Dati', peso: 0.10, valore: 0 }
  ];

  // F1: Scostamento tasso
  if (soglia > 0) {
    const scostamento = ((teg - soglia) / soglia) * 100;
    // Normalizza: 0% = 0, 100%+ = 1
    fattori[0].valore = Math.min(scostamento / 100, 1);
  }

  // F2: Polizze (esempio semplificato)
  if (fattori_input.polizze_obbligatorie === false) {
    fattori[1].valore = 0.0; // Nessuna polizza obbligatoria = buono
  } else {
    fattori[1].valore = 0.5; // Parziale
  }

  // F3-F6: Esempi semplificati (in produzione: logica completa)
  fattori[2].valore = 0.1; // Epoca recente
  fattori[3].valore = 0.1; // Tipo standard
  fattori[4].valore = 0.0; // Moratori ok
  fattori[5].valore = 0.0; // Dati completi

  // Calcola score pesato
  let score = 0;
  for (const f of fattori) {
    score += f.valore * f.peso;
  }

  // Arrotonda a intero 0-4
  const score_finale = Math.round(score * 4);

  return {
    score: score_finale,
    fattori,
    affidabilita: score_finale <= 1 ? 'Alta' : (score_finale <= 2 ? 'Media' : 'Bassa'),
    orientamento_giurisp: score_finale <= 1 ? 'Favorevole' : (score_finale <= 2 ? 'Neutro' : 'Contrario')
  };
}

module.exports = { calcola_score };
