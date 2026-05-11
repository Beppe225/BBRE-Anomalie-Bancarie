function seedRegole(db) {
  console.log('📜 [Seed] Inserimento regole normative...');
  
  const regole = [
    { codice: 'R001', descrizione: 'Spese di istruttoria incluse nel TEG se anticipate', tipo: 'inclusione', parametri: JSON.stringify({anticipate: true}), attiva: 1 },
    { codice: 'R002', descrizione: 'Polizza credito/impiego esclusa se non obbligatoria', tipo: 'esclusione', parametri: JSON.stringify({obbligatoria: false}), attiva: 1 },
    { codice: 'R003', descrizione: 'Commissioni di massimo scoperto escluse dal TEGM', tipo: 'esclusione', parametri: JSON.stringify({tipo: 'cms'}), attiva: 1 },
    { codice: 'R004', descrizione: 'Tasso mora = tasso soglia + 2% (max 8%)', tipo: 'soglia', parametri: JSON.stringify({delta: 0.02, max: 0.08}), attiva: 1 },
    { codice: 'R005', descrizione: 'Ricalcolo TEG con convenzione actual/365', tipo: 'calcolo', parametri: JSON.stringify({base_giorni: 365}), attiva: 1 }
  ];

  db.run("BEGIN TRANSACTION");
  const stmt = db.prepare("INSERT OR IGNORE INTO regole_normative (codice_regola, descrizione, tipo_regola, parametri, attiva) VALUES (?, ?, ?, ?, ?)");
  
  for (const r of regole) {
    stmt.run(r.codice, r.descrizione, r.tipo, r.parametri, r.attiva);
  }
  
  stmt.free();
  db.run("COMMIT");
  console.log('✅ [Seed] Regole R001-R005 caricate.');
}

module.exports = { seedRegole };
