/**
 * BBRE Anomalie Bancarie — Test DB post-seed
 * node src/db/test_db.js
 */

'use strict';

process.env.BBRE_STANDALONE = '1';
const { getDb, closeDb } = require('./db');

function separator(title) {
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`  ${title}`);
  console.log('─'.repeat(60));
}

function run() {
  const db = getDb();

  separator('STRUTTURA TABELLE');
  const tabelle = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
  ).all();
  console.log('Tabelle:', tabelle.map(t => t.name).join(', '));

  separator('SOGLIE USURA — Statistiche');
  const statSoglie = db.prepare(`
    SELECT categoria, COUNT(*) as n,
           MIN(tegm) as tegm_min, MAX(tegm) as tegm_max,
           MIN(anno) as anno_min, MAX(anno) as anno_max
    FROM soglie_usura
    GROUP BY categoria
    ORDER BY categoria
  `).all();
  statSoglie.forEach(r => {
    console.log(`  ${r.categoria}`);
    console.log(`    Record: ${r.n} | Anni: ${r.anno_min}–${r.anno_max} | TEGM: ${r.tegm_min}%–${r.tegm_max}%`);
  });

  separator('VERIFICA FORMULA SOGLIE — Campione 2010 vs 2012 (ante/post 2011)');
  const campione = db.prepare(`
    SELECT anno, trimestre, tegm, tasso_soglia, formula_applicata, categoria
    FROM soglie_usura
    WHERE categoria = 'Mutui ipotecari a tasso fisso'
      AND anno IN (2008, 2010, 2012, 2023)
    ORDER BY anno, trimestre
    LIMIT 8
  `).all();
  campione.forEach(r => {
    const expected_old = parseFloat((r.tegm * 1.5).toFixed(4));
    const delta = Math.min(r.tegm * 0.25 + 4, 8);
    const expected_new = parseFloat((r.tegm + delta).toFixed(4));
    const expected = r.formula_applicata === 'vecchia' ? expected_old : expected_new;
    const ok = Math.abs(r.tasso_soglia - expected) < 0.001 ? '✅' : '❌';
    console.log(`  ${ok} ${r.anno}T${r.trimestre} TEGM ${r.tegm}% → Soglia ${r.tasso_soglia}% (${r.formula_applicata}, atteso: ${expected}%)`);
  });

  separator('REGOLE NORMATIVE');
  const regole = db.prepare(`
    SELECT codice, tipo, titolo FROM regole_normative WHERE attiva = 1 ORDER BY codice
  `).all();
  regole.forEach(r => console.log(`  ${r.codice} [${r.tipo}] ${r.titolo}`));

  separator('TEST QUERY SOGLIA PER DATA E CATEGORIA');
  // Simula: mutuo fisso stipulato il 15/06/2022
  const soglia = db.prepare(`
    SELECT * FROM soglie_usura
    WHERE categoria = 'Mutui ipotecari a tasso fisso'
      AND data_inizio <= '2022-06-15'
      AND data_fine   >= '2022-06-15'
    ORDER BY data_inizio DESC
    LIMIT 1
  `).get();
  if (soglia) {
    console.log(`  Mutuo fisso del 2022-06-15:`);
    console.log(`  TEGM: ${soglia.tegm}% | Soglia: ${soglia.tasso_soglia}% | Formula: ${soglia.formula_applicata}`);
  } else {
    console.log('  ⚠️  Nessuna soglia trovata — verificare seed');
  }

  separator('TOTALI DB');
  const counts = ['contratti','voci_costo','soglie_usura','regole_normative','analisi','report'];
  counts.forEach(t => {
    const n = db.prepare(`SELECT COUNT(*) as n FROM ${t}`).get().n;
    console.log(`  ${t}: ${n} record`);
  });

  console.log('\n✅ Test DB completato\n');
  closeDb();
}

run();
