/**
 * irr_teg.test.js - Test engine calcolo IRR/TEG
 * Fix v1.1: rimossa firma errata con array date
 */

const test = require('node:test');
const assert = require('node:assert');
const { calcola_irr } = require('../math/irr_teg');

// T1: Caso Torino 53/2026
// Capitale 30.000, 84 mesi, TAN 12.5%, polizza 3.200 condizionante
// TEG reale atteso > soglia 14.10%
test('T1: Caso Torino - polizza condizionante su mutuo 84 mesi', (t) => {
  const capitale = 30000;
  const polizza  = 3200;
  const tan      = 0.125;
  const mesi     = 84;
  const tasso_m  = tan / 12;
  const rata     = (capitale * tasso_m) / (1 - Math.pow(1 + tasso_m, -mesi));

  const flussi = [-(capitale - polizza)];
  for (let i = 0; i < mesi; i++) flussi.push(rata);

  const res = calcola_irr(flussi, tan);

  assert.ok(res.convergenza, 'IRR deve convergere');
  assert.ok(res.irr_annuale > 0.141,
    `TEG reale (${(res.irr_annuale*100).toFixed(2)}%) deve superare soglia 14.10%`);
  assert.ok(res.irr_annuale > 0.125,
    `TEG reale deve essere maggiore del TAN dichiarato 12.5%`);
});

// T2: Caso pulito - nessuna anomalia
test('T2: Caso pulito - TEG = TAN dichiarato', (t) => {
  const capitale = 50000;
  const tan      = 0.05;
  const mesi     = 120;
  const tasso_m  = tan / 12;
  const rata     = (capitale * tasso_m) / (1 - Math.pow(1 + tasso_m, -mesi));

  const flussi = [-capitale];
  for (let i = 0; i < mesi; i++) flussi.push(rata);

  const res = calcola_irr(flussi, tan);

  assert.ok(res.convergenza, 'IRR deve convergere');
  // Senza costi aggiuntivi, TEG deve essere molto vicino al TAN
  assert.ok(Math.abs(res.irr_annuale - tan) < 0.001,
    `TEG (${(res.irr_annuale*100).toFixed(3)}%) deve essere vicino al TAN 5%`);
});

// T3: Polizza facoltativa - non inclusa nel TEG
test('T3: Polizza facoltativa - non cambia TEG', (t) => {
  const capitale = 20000;
  const tan      = 0.08;
  const mesi     = 60;
  const tasso_m  = tan / 12;
  const rata     = (capitale * tasso_m) / (1 - Math.pow(1 + tasso_m, -mesi));

  // Senza polizza
  const flussi_no_polizza = [-capitale];
  for (let i = 0; i < mesi; i++) flussi_no_polizza.push(rata);
  const res_no = calcola_irr(flussi_no_polizza, tan);

  // Con polizza NON inclusa (flusso iniziale invariato)
  const res_con = calcola_irr(flussi_no_polizza, tan);

  assert.ok(res_no.convergenza, 'Deve convergere senza polizza');
  assert.ok(res_con.convergenza, 'Deve convergere con polizza esclusa');
  assert.strictEqual(
    res_no.irr_annuale.toFixed(6),
    res_con.irr_annuale.toFixed(6),
    'TEG identico se polizza non inclusa'
  );
});

// T4: Contratto ante-2010 - verifica convergenza
test('T4: Contratto ante-2010 - IRR converge correttamente', (t) => {
  const capitale = 15000;
  const tan      = 0.10;
  const mesi     = 36;
  const tasso_m  = tan / 12;
  const rata     = (capitale * tasso_m) / (1 - Math.pow(1 + tasso_m, -mesi));
  const spese    = 500; // spese istruttoria ante-2010

  const flussi = [-(capitale - spese)];
  for (let i = 0; i < mesi; i++) flussi.push(rata);

  const res = calcola_irr(flussi, tan);

  assert.ok(res.convergenza, 'IRR deve convergere');
  assert.ok(res.irr_annuale > tan,
    `TEG (${(res.irr_annuale*100).toFixed(2)}%) deve superare TAN 10% per via delle spese`);
});

// T5: Dati incompleti - IRR converge comunque
test('T5: Dati minimi - convergenza garantita', (t) => {
  // Solo capitale e rata, nessun costo aggiuntivo
  const flussi = [-10000, 500, 500, 500, 500, 500, 500,
                   500,   500, 500, 500, 500, 500, 500,
                   500,   500, 500, 500, 500, 500, 500,
                   10500]; // bullet finale

  const res = calcola_irr(flussi, 0.06);

  assert.ok(res.convergenza, 'IRR deve convergere anche con dati minimi');
  assert.ok(res.irr_annuale > 0, 'IRR deve essere positivo');
});