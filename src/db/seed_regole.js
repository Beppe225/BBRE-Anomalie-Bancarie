/**
 * Seed regole normative (R001-R005)
 */

function seedRegoleNormative(db) {
  console.log('📜 Inserimento regole normative...');

  const regole = [
    [
      'R001',
      'Spese di istruttoria incluse nel TEG se anticipate',
      'inclusione',
      JSON.stringify({ anticipate: true }),
      1,
      '2005-01-01',
      null
    ],
    [
      'R002',
      'Polizza credito/impiego esclusa se non obbligatoria',
      'esclusione',
      JSON.stringify({ obbligatoria: false }),
      1,
      '2005-01-01',
      null
    ],
    [
      'R003',
      'Commissioni di massimo scoperto (CMS) escluse dal TEGM',
      'esclusione',
      JSON.stringify({ tipo: 'cms' }),
      1,
      '2005-01-01',
      null
    ],
    [
      'R004',
      'Tasso moratori = tasso soglia + 2% (max 8% oltre soglia)',
      'soglia',
      JSON.stringify({ delta: 0.02, max: 0.08 }),
      1,
      '2005-01-01',
      null
    ],
    [
      'R005',
      'Ricalcolo TEG con convenzione actual/365',
      'calcolo',
      JSON.stringify({ base_giorni: 365 }),
      1,
      '2005-01-01',
      null
    ]
  ];

  const stmt = db.prepare(`
    INSERT INTO regole_normative 
    (codice_regola, descrizione, tipo_regola, parametri, attiva, valid_from, valid_to)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  for (const regola of regole) {
    stmt.run(...regola);
  }

  console.log('✅ Inserite 5 regole normative (R001-R005)');
}

module.exports = { seedRegoleNormative };
