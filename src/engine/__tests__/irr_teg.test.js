const test = require('node:test');
const assert = require('node:assert');
const { calcola_irr } = require('../math/irr_teg');

// CASO DI TEST T1: Torino 53/2026
// Calcolo PRECISO per TEG 15.67%
test('T1: Convergenza IRR - Caso Torino 53/2026', (t) => {
  
  // CALCOLO INVERSO per TEG 15.67%:
  // Se TEG = 15.67% annuo → tasso mensile = (1.1567)^(1/12) - 1 = 1.217%
  // Con 12 rate da €865.26 (calcolate su €10,000 al 7% TAN):
  // Valore attuale = 865.26 * [(1 - 1.01217^-12) / 0.01217] = €9,622
  // 
  // Quindi:
  // Capitale nominale: €10,000
  // Costi totali: €10,000 - €9,622 = €378
  // NETTO EROGATO: €9,622
  
  const flussi = [
    -9622,    // T0: erogazione netta (10000 - 378 costi)
    865.26,   // Mese 1
    865.26,   // Mese 2
    865.26,   // Mese 3
    865.26,   // Mese 4
    865.26,   // Mese 5
    865.26,   // Mese 6
    865.26,   // Mese 7
    865.26,   // Mese 8
    865.26,   // Mese 9
    865.26,   // Mese 10
    865.26,   // Mese 11
    865.26    // Mese 12
  ];

  const date = [
    '2024-01-01',
    '2024-02-01',
    '2024-03-01',
    '2024-04-01',
    '2024-05-01',
    '2024-06-01',
    '2024-07-01',
    '2024-08-01',
    '2024-09-01',
    '2024-10-01',
    '2024-11-01',
    '2024-12-01',
    '2025-01-01'
  ];

  const risultato = calcola_irr(flussi, date, 0.10);

  console.log(`\n📊 Risultato T1 (Torino 53/2026):`);
  console.log(`   TEG Annuo: ${(risultato.irr_annuale * 100).toFixed(4)}%`);
  console.log(`   Convergenza: ${risultato.convergenza}`);
  console.log(`   Metodo: ${risultato.metodo_usato}`);
  console.log(`   Iterazioni: ${risultato.iterazioni}\n`);

  // Verifica convergenza
  assert.ok(risultato.convergenza, 'IRR dovrebbe convergere');
  
  // Verifica che sia nell'intervallo 15-16% (realistico per caso usura)
  assert.ok(
    risultato.irr_annuale >= 0.15 && risultato.irr_annuale <= 0.16, 
    `Il TEG dovrebbe essere ~15.67%, invece è ${(risultato.irr_annuale * 100).toFixed(4)}%`
  );
});

// T2: Verifica fallback Bisezione
test('T2: Fallback Bisezione', (t) => {
  const flussi = [1000, -2000, 1000]; 
  const date = [
    '2024-01-01',
    '2024-07-01',
    '2025-01-01'
  ];

  const res = calcola_irr(flussi, date);
  assert.ok(res.convergenza, 'Dovrebbe convergere tramite fallback o Newton');
});

// T3: Test convergenza rapida con Newton
test('T3: Newton-Raphson convergenza rapida', (t) => {
  const flussi = [-10000, 3000, 3000, 3000, 3000];
  const date = [
    '2024-01-01',
    '2024-04-01',
    '2024-07-01',
    '2024-10-01',
    '2025-01-01'
  ];

  const res = calcola_irr(flussi, date, 0.08);
  assert.ok(res.convergenza, 'Dovrebbe convergere');
  assert.ok(res.iterazioni < 100, 'Newton dovrebbe convergere rapidamente');
});
