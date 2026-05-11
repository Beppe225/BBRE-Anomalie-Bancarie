/**
 * seed_regole.js - Popola la tabella delle regole normative
 * Utilizza INSERT OR IGNORE per evitare crash su riavvii multipli
 */

function seedRegoleNormative(db) {
  console.log(' Inserimento regole normative...');
  const regole = [
    { codice: 'R001', desc: 'Spese di istruttoria incluse nel TEG se anticipate', tipo: 'inclusione', params: '{"anticipate":true}', attiva: 1 },
    { codice: 'R002', desc: 'Polizza credito/impiego esclusa se non obbligatoria', tipo: 'esclusione', params: '{"obbligatoria":false}', attiva: 1 },
    { codice: 'R003', desc: 'Commissioni di massimo scoperto (CMS) escluse dal TEGM', tipo: 'esclusione', params: '{"tipo":"cms"}', attiva: 1 },
    { codice: 'R004', desc: 'Tasso moratori = tasso soglia + 2% (max 8% oltre soglia)', tipo: 'soglia', params: '{"delta":0.02,"max":0.08}', attiva: 1 },
    { codice: 'R005', desc: 'Ricalcolo TEG con convenzione actual/365', tipo: 'calcolo', params: '{"base_giorni":365}', attiva: 1 }
  ];

  try {
    for (const r of regole) {
      db.run(`
        INSERT OR IGNORE INTO regole_normative 
        (codice_regola, descrizione, tipo_regola, parametri, attiva, valid_from, valid_to)
        VALUES (?, ?, ?, ?, ?, '2005-01-01', NULL)
      `, [r.codice, r.desc, r.tipo, r.params, r.attiva]);
    }
    console.log('✅ Inserite 5 regole normative (R001-R005)');
  } catch (err) {
    console.error('❌ Errore critico inserimento regole:', err.message);
    throw err;
  }
}

module.exports = { seedRegoleNormative };
