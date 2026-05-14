'use strict';

/**
 * BBRE Anomalie Bancarie — Test Suite Sessione B
 * 5 casi obbligatori + helper per DB SQLite in-memory
 *
 * Esecuzione: node src/engine/__tests__/test_irr.js
 */

// ─── Setup: usa better-sqlite3 se disponibile, altrimenti mock DB ────────────
let Database;
try {
  Database = require('better-sqlite3');
} catch (e) {
  // Fallback: mock minimo per test standalone
  Database = null;
}

const { calcola_irr, costruisci_flussi, calcola_teg_dichiarato_ricalcolato } = require('../math/irr_calculator');
const { calcola_score, get_epoca_contratto } = require('../normativa/score_engine');
const { get_soglia_db, calcola_soglia_moratori } = require('../math/soglia_calculator');
const { get_regole_attive, determina_inclusione_voci } = require('../normativa/regole_engine');

// ─── Helper: crea DB in-memory con schema minimo ──────────────────────────────
function crea_db_test() {
  if (!Database) {
    console.warn('⚠  better-sqlite3 non disponibile — test DB saltati');
    return null;
  }

  const db = new Database(':memory:');

  db.exec(`
    CREATE TABLE IF NOT EXISTS soglie_usura (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      anno INTEGER,
      trimestre INTEGER,
      tipo_contratto TEXT,
      classe_importo_min REAL,
      classe_importo_max REAL,
      tegm REAL,
      tasso_soglia REAL,
      formula TEXT,
      fonte_gazzetta TEXT,
      data_inizio TEXT,
      data_fine TEXT,
      versione_dataset TEXT,
      note TEXT
    );

    CREATE TABLE IF NOT EXISTS regole_normative (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      codice TEXT,
      tipo TEXT,
      descrizione TEXT,
      attiva INTEGER DEFAULT 1,
      data_validita_da TEXT,
      data_validita_a TEXT,
      priorita INTEGER DEFAULT 10,
      orientamento TEXT,
      tipo_voce_target TEXT,
      inclusione_default INTEGER DEFAULT 0,
      warning_testo TEXT,
      valore_numerico REAL,
      fonte TEXT
    );

    CREATE TABLE IF NOT EXISTS contratti (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tipo_contratto TEXT,
      capitale_erogato REAL,
      rata_mensile REAL,
      durata_mesi INTEGER,
      tan REAL,
      teg_dichiarato REAL,
      data_stipula TEXT,
      tasso_mora REAL,
      documento_caricato INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS voci_costo (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      contratto_id INTEGER,
      descrizione TEXT,
      tipo TEXT,
      importo REAL,
      condizionante INTEGER DEFAULT 0,
      tipo_flusso TEXT DEFAULT 'upfront',
      stimata INTEGER DEFAULT 0,
      inclusa_nel_teg_dichiarato INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS analisi (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      contratto_id INTEGER,
      engine_version TEXT,
      teg_reale REAL,
      teg_dichiarato REAL,
      teg_dichiarato_ricalcolato REAL,
      delta_teg_dichiarato REAL,
      tasso_soglia REAL,
      soglia_moratori REAL,
      tasso_mora REAL,
      moratori_in_anomalia INTEGER,
      score INTEGER,
      score_label TEXT,
      affidabilita TEXT,
      orientamento_giurisprudenziale TEXT,
      recupero_min REAL,
      recupero_max REAL,
      in_usura INTEGER,
      delta_percentuale REAL,
      voci_incluse_count INTEGER,
      voci_escluse_count INTEGER,
      warnings_count INTEGER,
      data_analisi TEXT,
      versione_dataset_soglie TEXT
    );

    CREATE TABLE IF NOT EXISTS audit_analisi (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      analisi_id INTEGER,
      contratto_id INTEGER,
      engine_version TEXT,
      snapshot_json TEXT,
      timestamp TEXT
    );
  `);

  // Inserisci soglie di test
  db.prepare(`
    INSERT INTO soglie_usura (anno, trimestre, tipo_contratto, tegm, tasso_soglia, formula, fonte_gazzetta, data_inizio, data_fine, versione_dataset)
    VALUES
      (2024, 1, 'prestito_personale', 11.28, 14.10, 'TEGM × 1.25 + 4pp', 'G.U. n. 11 del 15/01/2024', '2024-01-01', '2024-03-31', '1.0'),
      (2024, 2, 'prestito_personale', 11.28, 14.10, 'TEGM × 1.25 + 4pp', 'G.U. n. 42 del 15/04/2024', '2024-04-01', '2024-06-30', '1.0'),
      (2015, 2, 'prestito_personale', 12.50, 19.63, 'TEGM × 1.5 + 4pp (pre-2011)', 'G.U. n. 98 del 2015', '2015-04-01', '2015-06-30', '1.0'),
      (2008, 3, 'prestito_personale', 13.20, 19.80, 'TEGM × 1.5 (ante-2011)', 'G.U. n. 201 del 2008', '2008-07-01', '2008-09-30', '1.0'),
      (2024, 1, 'mutuo_ipotecario', 4.52, 9.65, 'TEGM × 1.25 + 4pp', 'G.U. n. 11 del 15/01/2024', '2024-01-01', '2024-03-31', '1.0')
  `).run();

  // Inserisci regole normative base
  db.prepare(`
    INSERT INTO regole_normative (codice, tipo, descrizione, attiva, priorita, fonte)
    VALUES
      ('R001', 'inclusione_voci', 'Voce condizionante: inclusione obbligatoria nel TEG reale', 1, 1, 'Art. 644 c.p. — L. 108/1996'),
      ('R002', 'inclusione_voci', 'Polizza non condizionante 2010-2016: orientamento diviso', 1, 2, 'Cass. 2015-2016'),
      ('R003', 'inclusione_voci', 'Polizza non condizionante post-2017: esclusione prevalente', 1, 3, 'D.lgs 72/2016'),
      ('R004', 'inclusione_voci', 'Polizza ante-2010: normativa pre-CCD, orientamento diviso', 1, 4, 'L. 108/1996 originale'),
      ('R005', 'inclusione_voci', 'Spese obbligatorie connesse all erogazione: sempre incluse', 1, 5, 'Provv. Banca Italia 29/07/2009'),
      ('R006', 'inclusione_voci', 'Servizi facoltativi: esclusi dal TEG', 1, 6, 'Direttiva CCD 2008/48/CE'),
      ('DELTA_MORATORI', 'configurazione', 'Delta soglia moratori su soglia base', 1, 1, 'Banca d Italia — Circolare 2003'),
      ('REF_FAV_1', 'riferimento', 'Cass. Civ. SS.UU. 19597/2020 — usura sopravvenuta', 1, 1, 'Cassazione 2020')
  `).run();

  // Aggiorna il valore numerico per DELTA_MORATORI
  db.prepare(`UPDATE regole_normative SET valore_numerico = 2.1 WHERE codice = 'DELTA_MORATORI'`).run();
  db.prepare(`UPDATE regole_normative SET orientamento = 'FAVOREVOLE' WHERE codice = 'REF_FAV_1'`).run();

  return db;
}

// ─── Helper: report sintetico di un test ──────────────────────────────────────
let passed = 0;
let failed = 0;
const risultati = [];

function assert(condizione, messaggio) {
  if (condizione) {
    console.log(`  ✅ ${messaggio}`);
    passed++;
    risultati.push({ ok: true, msg: messaggio });
  } else {
    console.error(`  ❌ FALLITO: ${messaggio}`);
    failed++;
    risultati.push({ ok: false, msg: messaggio });
  }
}

function test_header(nome) {
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`📋 ${nome}`);
  console.log('─'.repeat(60));
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST T1: Caso Torino 53/2026
// Capitale €30.000, 84 mesi, TAN 12.5%, polizza €3.200 condizionante
// TEG reale atteso: ~15.67% — supera soglia 14.10%
// ─────────────────────────────────────────────────────────────────────────────
function test_T1_caso_torino() {
  test_header('T1 — Caso Torino 53/2026: polizza condizionante, usura');

  const contratto = {
    capitale_erogato: 30000,
    rata_mensile: 521.83, // calcolato su TAN 12.5%, 84 mesi
    durata_mesi: 84,
    tan: 12.5,
    teg_dichiarato: 13.24,
    data_stipula: '2024-02-15',
    tipo_contratto: 'prestito_personale',
    documento_caricato: 1
  };

  // Polizza condizionante da 3.200€ (upfront)
  const voci = [
    { id: 1, descrizione: 'Polizza CPI condizionante', tipo: 'polizza', importo: 3200, condizionante: 1, tipo_flusso: 'upfront', stimata: 0 }
  ];

  const flussi = costruisci_flussi(contratto, voci);
  const irr = calcola_irr(flussi);

  console.log(`  → IRR convergenza: ${irr.convergenza_ok}, iterazioni: ${irr.iterazioni}`);
  console.log(`  → TEG reale calcolato: ${irr.irr_annuale?.toFixed(4)}%`);
  console.log(`  → TEG atteso: ~15.67%`);

  assert(irr.convergenza_ok === true, 'IRR converge correttamente');
  assert(irr.irr_annuale !== null, 'IRR annuale calcolato');
  assert(irr.irr_annuale > 14.5 && irr.irr_annuale < 17.0, `TEG reale nell\'intervallo atteso 14.5%-17.0% (ottenuto: ${irr.irr_annuale?.toFixed(2)}%)`);
  assert(irr.irr_annuale > 14.10, `TEG reale (${irr.irr_annuale?.toFixed(2)}%) supera soglia 14.10%`);

  // Test score con DB
  const db = crea_db_test();
  if (db) {
    const soglia_data = get_soglia_db(db, contratto.data_stipula, contratto.tipo_contratto, contratto.capitale_erogato);
    const voci_analizzate = [{ voce_id: 1, descrizione: 'Polizza CPI', inclusa: true, tipo: 'polizza', motivazione: 'condizionante', regola_applicata_id: 1, warning: null, tipo_flusso: 'upfront' }];
    const score_result = calcola_score(irr.irr_annuale, soglia_data, contratto.data_stipula, voci_analizzate, db, contratto);

    console.log(`  → Score: ${score_result.score} — ${score_result.label}`);
    assert(soglia_data.trovato, 'Soglia trovata nel DB');
    assert(soglia_data.tasso_soglia === 14.10, `Soglia corretta: ${soglia_data.tasso_soglia}%`);
    assert(score_result.score >= 2, `Score anomalia >= 2 (ottenuto: ${score_result.score})`);
    assert(score_result.in_usura === true, 'Contratto in usura rilevato');
    db.close();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST T2: Caso pulito — nessuna polizza, TEG reale = dichiarato
// ─────────────────────────────────────────────────────────────────────────────
function test_T2_caso_pulito() {
  test_header('T2 — Caso pulito: nessuna polizza, TEG reale = dichiarato');

  // Rata esatta: PMT(8%/12, 48, 20000) = 488.26
  const contratto = {
    capitale_erogato: 20000,
    rata_mensile: 488.26, // TAN 8%, 48 mesi — calcolato con formula PMT
    durata_mesi: 48,
    tan: 8.0,
    teg_dichiarato: 8.30,
    data_stipula: '2024-03-01',
    tipo_contratto: 'prestito_personale',
    documento_caricato: 1
  };

  const flussi_senza_voci = costruisci_flussi(contratto, []);
  const irr_senza = calcola_irr(flussi_senza_voci);

  console.log(`  → TEG reale (solo rata): ${irr_senza.irr_annuale?.toFixed(4)}%`);
  console.log(`  → TEG dichiarato: ${contratto.teg_dichiarato}%`);

  assert(irr_senza.convergenza_ok === true, 'IRR converge senza voci accessorie');
  assert(Math.abs(irr_senza.irr_annuale - contratto.teg_dichiarato) < 1.0, `TEG reale vicino al dichiarato (delta < 1pp): ${Math.abs(irr_senza.irr_annuale - contratto.teg_dichiarato).toFixed(4)}pp`);

  const db = crea_db_test();
  if (db) {
    const soglia_data = get_soglia_db(db, contratto.data_stipula, contratto.tipo_contratto, contratto.capitale_erogato);
    const score_result = calcola_score(irr_senza.irr_annuale, soglia_data, contratto.data_stipula, [], db, contratto);

    console.log(`  → Score: ${score_result.score} — ${score_result.label}`);
    assert(score_result.score === 0, `Score = 0 (nessuna anomalia), ottenuto: ${score_result.score}`);
    assert(score_result.in_usura === false, 'Contratto correttamente classificato: NON in usura');
    db.close();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST T3: Polizza facoltativa — non inclusa, warning presente
// ─────────────────────────────────────────────────────────────────────────────
function test_T3_polizza_facoltativa() {
  test_header('T3 — Polizza facoltativa: non inclusa, warning atteso');

  const db = crea_db_test();
  if (!db) {
    console.warn('  ⏭  DB non disponibile — test saltato');
    return;
  }

  const voci_costo = [
    { id: 10, descrizione: 'Polizza vita facoltativa', tipo: 'polizza', importo: 1500, condizionante: 0, tipo_flusso: 'upfront', stimata: 0 }
  ];

  const regole = get_regole_attive(db, 'inclusione_voci', '2024-01-15');
  const analisi = determina_inclusione_voci(voci_costo, regole, '2024-01-15');

  console.log(`  → Voce inclusa: ${analisi[0].inclusa}`);
  console.log(`  → Warning: ${analisi[0].warning}`);
  console.log(`  → Motivazione: ${analisi[0].motivazione}`);

  assert(analisi.length === 1, '1 voce analizzata');
  assert(analisi[0].inclusa === false, 'Polizza facoltativa NON inclusa nel TEG');
  assert(analisi[0].warning !== null && analisi[0].warning.length > 0, 'Warning presente per polizza non condizionante');

  db.close();
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST T4: Contratto ante-2010 — formula vecchia soglia, warning diviso
// ─────────────────────────────────────────────────────────────────────────────
function test_T4_ante_2010() {
  test_header('T4 — Contratto ante-2010: formula soglia vecchia, warning diviso');

  const data_stipula_ante = '2008-08-20';
  const epoca = get_epoca_contratto(data_stipula_ante);

  assert(epoca === 'ante2010', `Epoca correttamente identificata: ${epoca}`);

  const db = crea_db_test();
  if (!db) {
    console.warn('  ⏭  DB non disponibile — test parziale');
    return;
  }

  // Cerca soglia ante-2010
  const soglia_ante = get_soglia_db(db, data_stipula_ante, 'prestito_personale', 15000);
  console.log(`  → Soglia ante-2010: TEGM=${soglia_ante.tegm}%, soglia=${soglia_ante.tasso_soglia}%`);
  assert(soglia_ante.trovato, 'Soglia ante-2010 trovata nel DB');

  // Verifica che la polizza ante-2010 generi warning "ORIENTAMENTO DIVISO"
  const voci = [
    { id: 20, descrizione: 'Polizza vita', tipo: 'polizza', importo: 2000, condizionante: 0, tipo_flusso: 'upfront', stimata: 0 }
  ];
  const regole = get_regole_attive(db, 'inclusione_voci', data_stipula_ante);
  const analisi = determina_inclusione_voci(voci, regole, data_stipula_ante);

  console.log(`  → Warning ante-2010: ${analisi[0].warning?.substring(0, 80)}...`);
  assert(analisi[0].warning !== null, 'Warning generato per polizza ante-2010');
  assert(analisi[0].warning.includes('ante-2010') || analisi[0].warning.includes('DIVISO'), 'Warning menziona ante-2010 o DIVISO');

  // Contratto ante-2010 con TEG reale > soglia ante-2010
  const contratto = {
    capitale_erogato: 15000,
    rata_mensile: 395.5,
    durata_mesi: 48,
    tan: 19.0,
    teg_dichiarato: 19.50,
    data_stipula: data_stipula_ante,
    tipo_contratto: 'prestito_personale',
    documento_caricato: 1
  };

  const flussi = costruisci_flussi(contratto, []);
  const irr = calcola_irr(flussi);
  console.log(`  → TEG reale ante-2010: ${irr.irr_annuale?.toFixed(4)}%`);

  assert(irr.convergenza_ok, 'IRR converge per contratto ante-2010');

  const score_result = calcola_score(irr.irr_annuale, soglia_ante, data_stipula_ante, analisi, db, contratto);
  console.log(`  → Score ante-2010: ${score_result.score} — ${score_result.label}`);
  console.log(`  → Orientamento: ${score_result.orientamento_giurisprudenziale}`);

  assert(['DIVISO', 'FAVOREVOLE', 'SFAVOREVOLE'].includes(score_result.orientamento_giurisprudenziale), `Orientamento valorizzato: ${score_result.orientamento_giurisprudenziale}`);

  db.close();
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST T5: Dati incompleti — affidabilità 'bassa', score ridotto
// ─────────────────────────────────────────────────────────────────────────────
function test_T5_dati_incompleti() {
  test_header('T5 — Dati incompleti: affidabilità bassa, score penalizzato');

  const db = crea_db_test();
  if (!db) {
    console.warn('  ⏭  DB non disponibile — test saltato');
    return;
  }

  // Contratto con dati incompleti: TEG dichiarato mancante, documento non caricato,
  // voci stimate, rata stimata
  const contratto_incompleto = {
    capitale_erogato: 25000,
    rata_mensile: 550.0, // stimata
    durata_mesi: 60,
    tan: null,           // mancante
    teg_dichiarato: null, // mancante
    data_stipula: '2024-01-10',
    tipo_contratto: 'prestito_personale',
    documento_caricato: 0  // documento non caricato
  };

  const voci_stimate = [
    { id: 30, descrizione: 'Polizza stimata', tipo: 'polizza', importo: 2000, condizionante: 1, tipo_flusso: 'upfront', stimata: 1 }
  ];

  const flussi = costruisci_flussi(contratto_incompleto, voci_stimate);
  const irr = calcola_irr(flussi);
  const soglia_data = get_soglia_db(db, contratto_incompleto.data_stipula, 'prestito_personale', 25000);

  const voci_analizzate = [
    { voce_id: 30, descrizione: 'Polizza stimata', inclusa: true, tipo: 'polizza', motivazione: 'condizionante', regola_applicata_id: 1, warning: null, tipo_flusso: 'upfront', stimata: 1 }
  ];

  const score_result = calcola_score(
    irr.irr_annuale || 16.5, // fallback se IRR non converge
    soglia_data,
    contratto_incompleto.data_stipula,
    voci_analizzate,
    db,
    contratto_incompleto
  );

  console.log(`  → Affidabilità: ${score_result.affidabilita}`);
  console.log(`  → Score: ${score_result.score} — ${score_result.label}`);
  console.log(`  → F6 contributo: ${score_result.fattori.find(f => f.codice === 'F6')?.contributo}`);

  assert(score_result.affidabilita === 'bassa', `Affidabilità = 'bassa' per dati incompleti (ottenuto: '${score_result.affidabilita}')`);
  assert(score_result.score <= 3, `Score <= 3 (penalizzazione applicata): ${score_result.score}`);
  assert(score_result.fattori.length === 6, `Tutti e 6 i fattori presenti: ${score_result.fattori.length}`);

  const f6 = score_result.fattori.find(f => f.codice === 'F6');
  assert(f6 !== undefined, 'Fattore F6 (affidabilità) presente');
  assert(f6.valore === 'bassa', `F6.valore = 'bassa': ${f6.valore}`);

  db.close();
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST AGGIUNTIVO: Validazione IRR puro (casi edge)
// ─────────────────────────────────────────────────────────────────────────────
function test_irr_edge_cases() {
  test_header('T6 — IRR edge cases: flussi invalidi e convergenza');

  // Input invalido: flussi vuoti
  const r_vuoto = calcola_irr([]);
  assert(r_vuoto.convergenza_ok === false, 'Array vuoto → convergenza_ok = false');

  // Input invalido: solo flussi positivi
  const r_positivi = calcola_irr([
    { periodo_mese: 0, importo: 100 },
    { periodo_mese: 1, importo: 100 }
  ]);
  assert(r_positivi.convergenza_ok === false, 'Solo flussi positivi → convergenza_ok = false');

  // Caso semplice: prestito 1000€, rimborso 1100€ dopo 12 mesi
  // IRR annuale atteso: 10%
  const flussi_semplice = [
    { periodo_mese: 0, importo: -1000 },
    { periodo_mese: 12, importo: 1100 }
  ];
  const r_semplice = calcola_irr(flussi_semplice);
  console.log(`  → IRR caso semplice: ${r_semplice.irr_annuale?.toFixed(4)}% (atteso ~10%)`);
  assert(r_semplice.convergenza_ok === true, 'Caso semplice converge');
  assert(Math.abs(r_semplice.irr_annuale - 10.0) < 0.1, `IRR annuale ~10% (ottenuto: ${r_semplice.irr_annuale?.toFixed(4)}%)`);
}

// ─────────────────────────────────────────────────────────────────────────────
// ESECUZIONE
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n' + '═'.repeat(60));
console.log('  BBRE ANOMALIE BANCARIE — Test Suite Sessione B');
console.log('  Engine v1.0.0');
console.log('═'.repeat(60));

try { test_T1_caso_torino(); } catch (e) { console.error('ERRORE T1:', e.message); failed++; }
try { test_T2_caso_pulito(); } catch (e) { console.error('ERRORE T2:', e.message); failed++; }
try { test_T3_polizza_facoltativa(); } catch (e) { console.error('ERRORE T3:', e.message); failed++; }
try { test_T4_ante_2010(); } catch (e) { console.error('ERRORE T4:', e.message); failed++; }
try { test_T5_dati_incompleti(); } catch (e) { console.error('ERRORE T5:', e.message); failed++; }
try { test_irr_edge_cases(); } catch (e) { console.error('ERRORE T6:', e.message); failed++; }

// ─── Report finale ────────────────────────────────────────────────────────────
console.log('\n' + '═'.repeat(60));
console.log(`  RISULTATO FINALE: ${passed} passed, ${failed} failed`);
if (failed === 0) {
  console.log('  ✅ TUTTI I TEST SUPERATI');
} else {
  console.log('  ❌ ALCUNI TEST FALLITI — verificare i moduli');
}
console.log('═'.repeat(60) + '\n');

// Exit code per CI
process.exit(failed > 0 ? 1 : 0);
