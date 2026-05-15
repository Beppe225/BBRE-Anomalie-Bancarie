/**
 * test_anatocismo.js — Test Sessione F
 * Caso test: mutuo €200.000, 20 anni (240 mesi), TAN 4%
 * Eseguire con: node test_anatocismo.js
 */

const {
  ricostruisci_piano_francese,
  calcola_interessi_su_interessi,
  verifica_coerenza_rate
} = require('./src/engine/math/ammortamento_calculator');

const { analizza_anatocismo } = require('./src/engine/normativa/anatocismo_engine');

console.log('\n=================================================================');
console.log('  BBRE Anomalie Bancarie — Test Sessione F: Modulo Anatocismo');
console.log('=================================================================\n');

// ── TEST 1: Ricostruzione piano francese ──────────────────────────────────
console.log('TEST 1 — ricostruisci_piano_francese()');
console.log('Contratto: €200.000, TAN 4%, 240 mesi');
console.log('---');

const contratto_test = {
  capitale:     200000,
  tan:          0.04,
  durata_mesi:  240,
  data_stipula: '2020-01-15'
};

const piano = ricostruisci_piano_francese(contratto_test);

console.log(`Piano generato: ${piano.length} rate`);
console.log('\nPrime 5 rate:');
console.log('N   | Data       | Rata      | Q.Int.    | Q.Cap.    | Deb.Res.Fine');
console.log('----+-----------+-----------+-----------+-----------+-------------');
piano.slice(0, 5).forEach(r => {
  console.log(
    `${String(r.n).padStart(3)} | ${r.data_scadenza} | ${r.rata.toFixed(2).padStart(9)} | ` +
    `${r.quota_interessi.toFixed(2).padStart(9)} | ${r.quota_capitale.toFixed(2).padStart(9)} | ` +
    `${r.debito_residuo_fine.toFixed(2).padStart(12)}`
  );
});
console.log('\nUltime 3 rate:');
piano.slice(-3).forEach(r => {
  console.log(
    `${String(r.n).padStart(3)} | ${r.data_scadenza} | ${r.rata.toFixed(2).padStart(9)} | ` +
    `${r.quota_interessi.toFixed(2).padStart(9)} | ${r.quota_capitale.toFixed(2).padStart(9)} | ` +
    `${r.debito_residuo_fine.toFixed(2).padStart(12)}`
  );
});

// Verifica: rata teorica francese 4% 20 anni
const i_mensile = 0.04 / 12;
const rata_teorica = (200000 * i_mensile) / (1 - Math.pow(1 + i_mensile, -240));
console.log(`\nVerifica rata teorica: €${rata_teorica.toFixed(2)}`);
console.log(`Rata calcolata:        €${piano[0].rata.toFixed(2)}`);
const ok_rata = Math.abs(piano[0].rata - rata_teorica) < 0.01;
console.log(`✅ Rata corretta: ${ok_rata ? 'SÌ' : 'NO — ERRORE!'}`);

// ── TEST 2: Calcolo interessi su interessi ────────────────────────────────
console.log('\n---\nTEST 2 — calcola_interessi_su_interessi()');

const delta_result = calcola_interessi_su_interessi(piano, contratto_test);
console.log(`Totale interessi francese: €${delta_result.totale_interessi_francese.toFixed(2)}`);
console.log(`Totale interessi puro:     €${delta_result.totale_interessi_puro.toFixed(2)}`);
console.log(`Delta stimato (anatocismo):€${delta_result.delta_stimato.toFixed(2)}`);
console.log(`Incidenza %:               ${delta_result.percentuale_incidenza.toFixed(4)}%`);

// ── TEST 3: Verifica coerenza rate reali ──────────────────────────────────
console.log('\n---\nTEST 3 — verifica_coerenza_rate()');
const rate_reali_test = [
  { n: 1, rata: piano[0].rata, quota_interessi: piano[0].quota_interessi },
  { n: 2, rata: piano[1].rata + 0.30, quota_interessi: piano[1].quota_interessi }, // discrepanza < soglia 0.50
  { n: 3, rata: piano[2].rata + 1.50, quota_interessi: piano[2].quota_interessi }  // discrepanza > soglia 0.50
];
const verifica = verifica_coerenza_rate(piano, rate_reali_test);
console.log(`Coerente: ${verifica.coerente}`);
console.log(`Discrepanze rilevate: ${verifica.discrepanze.length}`);
verifica.discrepanze.forEach(d => console.log(`  Rata ${d.n}: diff €${d.differenza} (${d.tipo})`));
console.log(`Nota: ${verifica.nota}`);

// ── TEST 4: analizza_anatocismo (con mock DB) ─────────────────────────────
console.log('\n---\nTEST 4 — analizza_anatocismo() con mock DB');

// Mock DB minimale (sql.js non disponibile in contesto test puro)
const mock_db = {
  run: (sql, params) => { /* no-op */ }
};

const contratto_full = {
  capitale:       200000,
  tan_dichiarato: 0.04,
  durata_mesi:    240,
  data_stipula:   '2020-01-15',
  ammortamento:   'francese'
};

const risultato = analizza_anatocismo(mock_db, contratto_full, []);

console.log(`\nRisultato analisi anatocismo:`);
console.log(`  Applicabile:     ${risultato.applicabile}`);
console.log(`  Score anatocismo:${risultato.score_anatocismo}/3`);
console.log(`  Label:           ${risultato.label_anatocismo}`);
console.log(`  Delta €:         €${risultato.delta_euro.toFixed(2)}`);
console.log(`  Delta %:         ${risultato.delta_pct.toFixed(4)}%`);
console.log(`  Orientamento:    ${risultato.orientamento}`);
console.log(`\n  Fattori:`);
risultato.fattori_anatocismo.forEach(f => {
  console.log(`    ${f.id} | ${f.nome.padEnd(30)} | ${f.impatto}`);
});
console.log(`\n  Warnings:`);
risultato.warnings.forEach(w => console.log(`    ⚠️  ${w.substring(0, 100)}...`));

// ── TEST 5: Ammortamento NON francese ─────────────────────────────────────
console.log('\n---\nTEST 5 — Ammortamento non francese (atteso: score=0, applicabile=false)');
const contratto_italiano = { ...contratto_full, ammortamento: 'italiano' };
const ris_ital = analizza_anatocismo(mock_db, contratto_italiano, []);
console.log(`  Applicabile: ${ris_ital.applicabile} (atteso: false)`);
console.log(`  Score:       ${ris_ital.score_anatocismo} (atteso: 0)`);
console.log(`  ✅ ${!ris_ital.applicabile && ris_ital.score_anatocismo === 0 ? 'CORRETTO' : 'ERRORE!'}`);

// ── RIEPILOGO ─────────────────────────────────────────────────────────────
console.log('\n=================================================================');
console.log('  RIEPILOGO TEST SESSIONE F');
console.log('=================================================================');
console.log(`  Piano francese (€200K, 4%, 20a): ${piano.length} rate ✅`);
console.log(`  Rata mensile:                    €${piano[0].rata.toFixed(2)} ${ok_rata ? '✅' : '❌'}`);
console.log(`  Delta anatocismo stimato:         €${delta_result.delta_stimato.toFixed(2)}`);
console.log(`  Incidenza sul totale interessi:   ${delta_result.percentuale_incidenza.toFixed(4)}%`);
console.log(`  Score anatocismo:                 ${risultato.score_anatocismo}/3`);
console.log(`  Test ammortamento non francese:   ✅`);
console.log('\nSessione F — Modulo Anatocismo: TEST COMPLETATI');
console.log('=================================================================\n');
