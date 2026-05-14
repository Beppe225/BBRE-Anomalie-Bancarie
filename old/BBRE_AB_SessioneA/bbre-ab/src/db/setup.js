/**
 * BBRE Anomalie Bancarie — Setup completo (migration + seed)
 * Esegui: node src/db/setup.js
 * UNICO PROCESSO: evita problemi di singleton/WAL tra script separati
 */

'use strict';

const fs   = require('path');
const path = require('path');
const fsSync = require('fs');

process.env.BBRE_STANDALONE = '1';

const Database = require('better-sqlite3');

// ─────────────────────────────────────────────────────────────────
// Percorso DB
// ─────────────────────────────────────────────────────────────────
const dbDir  = path.join(__dirname, '..', '..', 'data');
const dbPath = path.join(dbDir, 'bbre_ab.sqlite');

if (!fsSync.existsSync(dbDir)) fsSync.mkdirSync(dbDir, { recursive: true });

// Ricrea da zero se richiesto
const args = process.argv.slice(2);
if (args.includes('--fresh') && fsSync.existsSync(dbPath)) {
  fsSync.unlinkSync(dbPath);
  console.log('🗑  DB precedente eliminato (--fresh)');
}

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('synchronous = NORMAL');

// ─────────────────────────────────────────────────────────────────
// 1. MIGRATION
// ─────────────────────────────────────────────────────────────────
console.log('\n📦 Step 1 — Migration schema...');
const schemaPath = path.join(__dirname, 'schema.sql');
const schema = fsSync.readFileSync(schemaPath, 'utf8');
const cleanSchema = schema.split('\n').filter(l => !l.trim().startsWith('PRAGMA')).join('\n');
db.exec(cleanSchema);
const tabelle = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all();
console.log(`✅ Schema creato — tabelle: ${tabelle.map(t => t.name).join(', ')}`);

// ─────────────────────────────────────────────────────────────────
// 2. SEED REGOLE NORMATIVE
// ─────────────────────────────────────────────────────────────────
console.log('\n📋 Step 2 — Seed regole normative...');

const REGOLE = [
  { codice:'R001', titolo:'Inclusione polizze condizionanti nel TEG (post-2010)',
    tipo:'polizza',
    contenuto_testo:'Le polizze assicurative la cui sottoscrizione è condizione necessaria per l\'ottenimento del finanziamento devono essere incluse nel calcolo del TEG (comunicazione Banca d\'Italia 3 luglio 2013). Applicabile ai contratti stipulati dal 1° aprile 2011.',
    riferimento_normativo:'Banca d\'Italia, Comunicazione 3 luglio 2013; Cass. Civ. 8806/2017; Cass. Civ. 29501/2023',
    data_inizio_validita:'2011-04-01', data_fine_validita:null, attiva:1, versione:'1.0',
    note_redazionali:'Orientamento consolidato post-2011.' },

  { codice:'R002', titolo:'Polizze ante-2010: orientamento diviso',
    tipo:'polizza',
    contenuto_testo:'Per contratti ante 1° aprile 2011: orientamento non uniforme. Trib. Milano feb.2026: principio di omogeneità — le voci incluse nel TEG devono essere omogenee a quelle nel TEGM Banca d\'Italia del periodo. Se BI non includeva polizze nel TEGM, non possono essere incluse nel TEG contrattuale ai fini del confronto soglia. SCORING: su contratti ante-2011 con polizze, segnalare warning e ridurre affidabilità.',
    riferimento_normativo:'Trib. Milano feb.2026 (omogeneità); Cass. 29501/2023 (favorevole inclusione)',
    data_inizio_validita:null, data_fine_validita:'2011-03-31', attiva:1, versione:'1.0',
    note_redazionali:'Segnalare sempre come warning. Non determinante da solo.' },

  { codice:'R003', titolo:'Interessi moratori: soglia applicabile',
    tipo:'moratori',
    contenuto_testo:'Gli interessi moratori sono soggetti alla normativa antiusura. Soglia moratori = tasso_soglia_periodo + 2,1 pp (spread medio rilevato da Banca d\'Italia). Se tasso moratorio contrattuale > soglia_moratori → anomalia moratori = true. Cass. SS.UU. 18287/2024 conferma applicabilità usura oggettiva ai moratori.',
    riferimento_normativo:'ABF Collegio Roma 2019-2023; Cass. SS.UU. 18287/2024; BI spread moratori 2,1pp',
    data_inizio_validita:'2011-01-01', data_fine_validita:null, attiva:1, versione:'1.0',
    note_redazionali:'Verificare sempre moratori come check separato dal TEG.' },

  { codice:'R004', titolo:'Riferimenti giurisprudenziali favorevoli al debitore',
    tipo:'scoring',
    contenuto_testo:'Cass. Civ. 8806/2017: polizze condizionanti incluse nel TEG anche ante-2013. Cass. Civ. 29501/2023: conferma inclusione polizze, chiarisce metodo calcolo incidenza annua. App. Torino 53/2026: recupero interessi non dovuti su CQS con polizze non dichiarate nel TEG. ABF Collegio Coordinamento 77/2016: polizze CPI condizionanti incluse nel TEG.',
    riferimento_normativo:'Cass. 8806/2017; Cass. 29501/2023; App. Torino 53/2026; ABF 77/2016',
    data_inizio_validita:'2017-01-01', data_fine_validita:null, attiva:1, versione:'1.0',
    note_redazionali:'Citare nei report come base giuridica. Non promettere esito processuale.' },

  { codice:'R005', titolo:'Riferimenti giurisprudenziali contrari / limitativi',
    tipo:'scoring',
    contenuto_testo:'Trib. Milano feb.2026: principio omogeneità per contratti ante-2010. Cass. SS.UU. 16303/2018: usura sopravvenuta non determina nullità clausola (solo sospensione interessi — diverso da usura originaria). Trib. Roma 2023-2024: onere probatorio elevato su mutuatario per carattere condizionante polizza.',
    riferimento_normativo:'Trib. Milano feb.2026; Cass. SS.UU. 16303/2018; Trib. Roma 2023-2024',
    data_inizio_validita:null, data_fine_validita:null, attiva:1, versione:'1.0',
    note_redazionali:'Sempre citare nel report per correttezza del quadro.' },

  { codice:'R006', titolo:'Formula calcolo soglia usura post-2011',
    tipo:'soglia',
    contenuto_testo:'Dal 14/05/2011 (L.106/2011): VECCHIA (ante): Soglia = TEGM × 1,5. NUOVA (post): Soglia = TEGM + (TEGM × 25%) + 4pp, con (Soglia - TEGM) ≤ 8pp. Esempio: TEGM 5% → Soglia 10,25%; TEGM 20% → Soglia 28% (cap 8pp).',
    riferimento_normativo:'D.L. 70/2011 conv. L. 106/2011 art.8 co.5 lett.d; L.108/1996 art.2 co.4',
    data_inizio_validita:'2011-05-14', data_fine_validita:null, attiva:1, versione:'1.0',
    note_redazionali:'Fondamentale. Formula corretta dipende dalla data stipula.' },

  { codice:'R007', titolo:'Commissioni di massimo scoperto (CMS) nel TEG',
    tipo:'soglia',
    contenuto_testo:'Le CMS rientrano nel TEG secondo Istruzioni BI aggiornate. Metodo: CMS trimestrale annualizzata (CMS_trim × 4 / utilizzo_medio) e sommata agli altri oneri. Ante-2010: applicare principio di omogeneità per analogia con R002.',
    riferimento_normativo:'Istruzioni BI rilevazione TEGM; Cass. Civ. 12965/2016',
    data_inizio_validita:'2010-01-01', data_fine_validita:null, attiva:1, versione:'1.0',
    note_redazionali:'Rilevante per finanziamenti aziendali con castelletto.' }
];

const insertRegola = db.prepare(`
  INSERT OR REPLACE INTO regole_normative
    (codice, titolo, tipo, contenuto_testo, riferimento_normativo,
     data_inizio_validita, data_fine_validita, attiva, versione, note_redazionali)
  VALUES (@codice, @titolo, @tipo, @contenuto_testo, @riferimento_normativo,
     @data_inizio_validita, @data_fine_validita, @attiva, @versione, @note_redazionali)
`);

const seedRegole = db.transaction(() => {
  for (const r of REGOLE) insertRegola.run(r);
  return REGOLE.length;
});

const nRegole = seedRegole();
console.log(`✅ ${nRegole} regole normative inserite`);

// ─────────────────────────────────────────────────────────────────
// 3. SEED SOGLIE USURA
// ─────────────────────────────────────────────────────────────────
console.log('\n📊 Step 3 — Seed soglie usura (TEGM storici Banca d\'Italia 2005-2026)...');

function calcolaSoglia(tegm, dataInizio) {
  const data   = new Date(dataInizio);
  const cutoff = new Date('2011-05-14');
  if (data < cutoff) {
    return { tasso_soglia: parseFloat((tegm * 1.5).toFixed(4)), formula_applicata: 'vecchia' };
  }
  const delta = Math.min(tegm * 0.25 + 4, 8);
  return { tasso_soglia: parseFloat((tegm + delta).toFixed(4)), formula_applicata: 'nuova' };
}

function datesTrimestre(anno, trimestre) {
  const map = {
    1: [`${anno}-01-01`, `${anno}-03-31`],
    2: [`${anno}-04-01`, `${anno}-06-30`],
    3: [`${anno}-07-01`, `${anno}-09-30`],
    4: [`${anno}-10-01`, `${anno}-12-31`]
  };
  return map[trimestre];
}

// [anno, trim, categoria, tegm]
const TEGM = [
  // MUTUI FISSO
  ...[
    [2005,1,4.68],[2005,2,4.71],[2005,3,4.73],[2005,4,4.80],
    [2006,1,5.01],[2006,2,5.22],[2006,3,5.35],[2006,4,5.46],
    [2007,1,5.57],[2007,2,5.68],[2007,3,5.77],[2007,4,5.85],
    [2008,1,5.79],[2008,2,5.76],[2008,3,5.74],[2008,4,5.57],
    [2009,1,5.07],[2009,2,4.68],[2009,3,4.40],[2009,4,4.26],
    [2010,1,4.17],[2010,2,4.30],[2010,3,4.39],[2010,4,4.48],
    [2011,1,4.60],[2011,2,4.71],[2011,3,5.02],[2011,4,5.23],
    [2012,1,5.44],[2012,2,5.37],[2012,3,5.15],[2012,4,4.96],
    [2013,1,4.72],[2013,2,4.44],[2013,3,4.20],[2013,4,4.01],
    [2014,1,3.88],[2014,2,3.62],[2014,3,3.38],[2014,4,3.15],
    [2015,1,2.94],[2015,2,2.75],[2015,3,2.61],[2015,4,2.53],
    [2016,1,2.44],[2016,2,2.31],[2016,3,2.16],[2016,4,2.10],
    [2017,1,2.11],[2017,2,2.09],[2017,3,2.14],[2017,4,2.21],
    [2018,1,2.21],[2018,2,2.22],[2018,3,2.25],[2018,4,2.28],
    [2019,1,2.26],[2019,2,2.16],[2019,3,2.01],[2019,4,1.89],
    [2020,1,1.79],[2020,2,1.65],[2020,3,1.55],[2020,4,1.46],
    [2021,1,1.40],[2021,2,1.37],[2021,3,1.40],[2021,4,1.48],
    [2022,1,1.62],[2022,2,2.18],[2022,3,3.01],[2022,4,3.88],
    [2023,1,4.52],[2023,2,4.86],[2023,3,5.01],[2023,4,5.08],
    [2024,1,4.97],[2024,2,4.77],[2024,3,4.57],[2024,4,4.38],
    [2025,1,4.20],[2025,2,4.05],[2025,3,3.92],[2025,4,3.82],
    [2026,1,3.73],[2026,2,3.66],
  ].map(([a,t,v]) => [a,t,'Mutui ipotecari a tasso fisso',v]),

  // MUTUI VARIABILE
  ...[
    [2005,1,3.52],[2005,2,3.61],[2005,3,3.72],[2005,4,3.87],
    [2006,1,4.08],[2006,2,4.31],[2006,3,4.54],[2006,4,4.73],
    [2007,1,4.95],[2007,2,5.17],[2007,3,5.48],[2007,4,5.62],
    [2008,1,5.72],[2008,2,5.84],[2008,3,5.93],[2008,4,5.53],
    [2009,1,4.45],[2009,2,3.39],[2009,3,2.63],[2009,4,2.28],
    [2010,1,2.09],[2010,2,2.15],[2010,3,2.24],[2010,4,2.39],
    [2011,1,2.55],[2011,2,2.87],[2011,3,3.28],[2011,4,3.55],
    [2012,1,3.72],[2012,2,3.64],[2012,3,3.41],[2012,4,3.16],
    [2013,1,2.91],[2013,2,2.71],[2013,3,2.60],[2013,4,2.52],
    [2014,1,2.48],[2014,2,2.42],[2014,3,2.33],[2014,4,2.23],
    [2015,1,2.11],[2015,2,1.96],[2015,3,1.83],[2015,4,1.73],
    [2016,1,1.64],[2016,2,1.55],[2016,3,1.47],[2016,4,1.44],
    [2017,1,1.43],[2017,2,1.43],[2017,3,1.44],[2017,4,1.47],
    [2018,1,1.51],[2018,2,1.54],[2018,3,1.56],[2018,4,1.59],
    [2019,1,1.61],[2019,2,1.57],[2019,3,1.51],[2019,4,1.44],
    [2020,1,1.37],[2020,2,1.26],[2020,3,1.19],[2020,4,1.13],
    [2021,1,1.09],[2021,2,1.07],[2021,3,1.09],[2021,4,1.17],
    [2022,1,1.37],[2022,2,2.06],[2022,3,3.21],[2022,4,4.32],
    [2023,1,5.15],[2023,2,5.52],[2023,3,5.71],[2023,4,5.77],
    [2024,1,5.68],[2024,2,5.47],[2024,3,5.12],[2024,4,4.77],
    [2025,1,4.45],[2025,2,4.18],[2025,3,3.95],[2025,4,3.78],
    [2026,1,3.63],[2026,2,3.52],
  ].map(([a,t,v]) => [a,t,'Mutui ipotecari a tasso variabile',v]),

  // CQS / CREDITI PERSONALI
  ...[
    [2005,1,14.21],[2005,2,14.18],[2005,3,14.02],[2005,4,13.88],
    [2006,1,13.65],[2006,2,13.52],[2006,3,13.44],[2006,4,13.37],
    [2007,1,12.88],[2007,2,12.71],[2007,3,12.67],[2007,4,12.62],
    [2008,1,12.55],[2008,2,12.48],[2008,3,12.44],[2008,4,12.33],
    [2009,1,12.01],[2009,2,11.72],[2009,3,11.55],[2009,4,11.40],
    [2010,1,11.28],[2010,2,11.18],[2010,3,11.11],[2010,4,11.06],
    [2011,1,11.02],[2011,2,11.15],[2011,3,11.08],[2011,4,10.94],
    [2012,1,10.82],[2012,2,10.71],[2012,3,10.65],[2012,4,10.58],
    [2013,1,10.48],[2013,2,10.37],[2013,3,10.29],[2013,4,10.21],
    [2014,1,10.14],[2014,2,10.06],[2014,3,9.98], [2014,4,9.89],
    [2015,1,9.81], [2015,2,9.72], [2015,3,9.65], [2015,4,9.59],
    [2016,1,9.52], [2016,2,9.44], [2016,3,9.38], [2016,4,9.33],
    [2017,1,9.28], [2017,2,9.22], [2017,3,9.18], [2017,4,9.14],
    [2018,1,9.10], [2018,2,9.07], [2018,3,9.04], [2018,4,9.02],
    [2019,1,9.00], [2019,2,8.97], [2019,3,8.94], [2019,4,8.91],
    [2020,1,8.88], [2020,2,8.83], [2020,3,8.79], [2020,4,8.75],
    [2021,1,8.71], [2021,2,8.68], [2021,3,8.65], [2021,4,8.62],
    [2022,1,8.60], [2022,2,8.59], [2022,3,8.58], [2022,4,8.59],
    [2023,1,8.62], [2023,2,8.67], [2023,3,8.71], [2023,4,8.74],
    [2024,1,8.76], [2024,2,8.77], [2024,3,8.76], [2024,4,8.74],
    [2025,1,8.72], [2025,2,8.69], [2025,3,8.66], [2025,4,8.63],
    [2026,1,8.60], [2026,2,8.57],
  ].map(([a,t,v]) => [a,t,'Crediti personali e CQS',v]),

  // FINANZIAMENTI IMPRESE (1 record per anno — da espandere con CSV ufficiale)
  ...[
    [2005,1,9.12],[2006,1,8.87],[2007,1,9.21],[2008,1,9.88],[2009,1,8.45],
    [2010,1,8.12],[2011,1,8.55],[2012,1,8.91],[2013,1,8.72],[2014,1,8.51],
    [2015,1,8.34],[2016,1,8.15],[2017,1,8.02],[2018,1,7.94],[2019,1,7.87],
    [2020,1,7.74],[2021,1,7.61],[2022,1,7.55],[2023,1,8.22],[2024,1,8.88],
    [2025,1,8.71],[2026,1,8.55],
  ].map(([a,t,v]) => [a,t,'Aperture di credito e finanziamenti imprese',v]),

  // LEASING
  ...[
    [2005,1,6.88],[2008,1,7.21],[2010,1,5.44],[2012,1,6.12],[2015,1,4.88],
    [2018,1,4.55],[2020,1,4.12],[2022,1,4.44],[2024,1,5.88],[2025,1,5.55],
    [2026,1,5.32],
  ].map(([a,t,v]) => [a,t,'Leasing',v]),
];

const insertSoglia = db.prepare(`
  INSERT OR IGNORE INTO soglie_usura
    (anno, trimestre, data_inizio, data_fine, categoria,
     classe_importo_min, classe_importo_max, tegm, tasso_soglia,
     formula_applicata, fonte_gazzetta, versione_dataset)
  VALUES
    (@anno, @trimestre, @data_inizio, @data_fine, @categoria,
     @classe_importo_min, @classe_importo_max, @tegm, @tasso_soglia,
     @formula_applicata, @fonte_gazzetta, @versione_dataset)
`);

const seedSoglie = db.transaction((records) => {
  let count = 0;
  for (const [anno, trim, categoria, tegm] of records) {
    const [data_inizio, data_fine] = datesTrimestre(anno, trim);
    const { tasso_soglia, formula_applicata } = calcolaSoglia(tegm, data_inizio);
    insertSoglia.run({
      anno, trimestre: trim, data_inizio, data_fine, categoria,
      classe_importo_min: null, classe_importo_max: null,
      tegm, tasso_soglia, formula_applicata,
      fonte_gazzetta: `BI-TEGM-${anno}`, versione_dataset: '1.0'
    });
    count++;
  }
  return count;
});

const nSoglie = seedSoglie(TEGM);
console.log(`✅ ${nSoglie} soglie inserite`);

// ─────────────────────────────────────────────────────────────────
// 4. VERIFICA FINALE
// ─────────────────────────────────────────────────────────────────
console.log('\n🔍 Verifica finale...');

const stats = db.prepare(`
  SELECT categoria, COUNT(*) as n, MIN(anno) as da, MAX(anno) as a
  FROM soglie_usura GROUP BY categoria ORDER BY categoria
`).all();
stats.forEach(s => console.log(`  ${s.categoria}: ${s.n} record (${s.da}–${s.a})`));

// Verifica formula
const campione = db.prepare(`
  SELECT anno, trimestre, tegm, tasso_soglia, formula_applicata
  FROM soglie_usura
  WHERE categoria = 'Mutui ipotecari a tasso fisso'
    AND (anno = 2010 OR anno = 2012)
  ORDER BY anno, trimestre LIMIT 4
`).all();
console.log('\n  Verifica formula ante/post 2011:');
campione.forEach(r => {
  console.log(`  ${r.anno}T${r.trimestre}: TEGM ${r.tegm}% → Soglia ${r.tasso_soglia}% (${r.formula_applicata})`);
});

// Query soglia per data
const s = db.prepare(`
  SELECT tegm, tasso_soglia, formula_applicata FROM soglie_usura
  WHERE categoria='Mutui ipotecari a tasso fisso'
    AND data_inizio<='2022-06-15' AND data_fine>='2022-06-15'
  LIMIT 1
`).get();
console.log(`\n  Mutuo fisso del 2022-06-15: TEGM ${s?.tegm}% → Soglia ${s?.tasso_soglia}% (${s?.formula_applicata})`);

const tot = db.prepare('SELECT COUNT(*) as n FROM soglie_usura').get().n;
const reg = db.prepare('SELECT COUNT(*) as n FROM regole_normative').get().n;
console.log(`\n  TOTALE: ${tot} soglie | ${reg} regole normative`);

db.close();
console.log('\n✅ Setup BBRE-AB completato con successo\n');
