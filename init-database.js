const DatabaseManager = require('./src/db/db');
const path = require('path');
const fs = require('fs');

async function initCompleteDatabase() {
  console.log('🚀 Inizializzazione database BBRE...\n');

  const dbManager = new DatabaseManager(path.join(__dirname, '../data/bbre.db'));
  await dbManager.init();
  const db = dbManager.getDb();

// 1. CARICA SCHEMA SE DB NUOVO
  const tables = db.exec("SELECT name FROM sqlite_master WHERE type='table'");
  if (tables.length === 0 || tables[0].values.length === 0) {
    console.log('📋 DB nuovo — carico schema...');
    const schema = fs.readFileSync(path.join(__dirname, 'src/db/schema.sql'), 'utf8');
    db.run(schema);
    console.log('✅ Schema caricato');
  } else {
    console.log('✅ Tabelle:', tables[0].values.map(t => t[0]).join(', '));
  }

  // 2. SOGLIE USURA — copertura trimestrale completa 2005-2026
  console.log('\n📊 Inserimento soglie usura...');
  db.run("DELETE FROM soglie_usura");
  db.run("BEGIN");

  const soglie = [
    [2005,1,'mutuo_ipotecario',4.20],[2005,2,'mutuo_ipotecario',4.15],[2005,3,'mutuo_ipotecario',4.10],[2005,4,'mutuo_ipotecario',4.05],
    [2006,1,'mutuo_ipotecario',4.00],[2006,2,'mutuo_ipotecario',4.10],[2006,3,'mutuo_ipotecario',4.20],[2006,4,'mutuo_ipotecario',4.35],
    [2007,1,'mutuo_ipotecario',4.50],[2007,2,'mutuo_ipotecario',4.65],[2007,3,'mutuo_ipotecario',4.80],[2007,4,'mutuo_ipotecario',4.90],
    [2008,1,'mutuo_ipotecario',5.00],[2008,2,'mutuo_ipotecario',5.20],[2008,3,'mutuo_ipotecario',5.30],[2008,4,'mutuo_ipotecario',4.80],
    [2009,1,'mutuo_ipotecario',4.20],[2009,2,'mutuo_ipotecario',3.80],[2009,3,'mutuo_ipotecario',3.50],[2009,4,'mutuo_ipotecario',3.30],
    [2010,1,'mutuo_ipotecario',3.20],[2010,2,'mutuo_ipotecario',3.10],[2010,3,'mutuo_ipotecario',3.00],[2010,4,'mutuo_ipotecario',3.10],
    [2011,1,'mutuo_ipotecario',3.20],[2011,2,'mutuo_ipotecario',3.40],[2011,3,'mutuo_ipotecario',3.60],[2011,4,'mutuo_ipotecario',3.80],
    [2012,1,'mutuo_ipotecario',4.00],[2012,2,'mutuo_ipotecario',4.20],[2012,3,'mutuo_ipotecario',4.10],[2012,4,'mutuo_ipotecario',3.90],
    [2013,1,'mutuo_ipotecario',3.70],[2013,2,'mutuo_ipotecario',3.50],[2013,3,'mutuo_ipotecario',3.30],[2013,4,'mutuo_ipotecario',3.10],
    [2014,1,'mutuo_ipotecario',2.90],[2014,2,'mutuo_ipotecario',2.80],[2014,3,'mutuo_ipotecario',2.70],[2014,4,'mutuo_ipotecario',2.60],
    [2015,1,'mutuo_ipotecario',2.50],[2015,2,'mutuo_ipotecario',2.40],[2015,3,'mutuo_ipotecario',2.30],[2015,4,'mutuo_ipotecario',2.20],
    [2016,1,'mutuo_ipotecario',2.10],[2016,2,'mutuo_ipotecario',2.05],[2016,3,'mutuo_ipotecario',2.00],[2016,4,'mutuo_ipotecario',1.95],
    [2017,1,'mutuo_ipotecario',1.90],[2017,2,'mutuo_ipotecario',1.88],[2017,3,'mutuo_ipotecario',1.85],[2017,4,'mutuo_ipotecario',1.83],
    [2018,1,'mutuo_ipotecario',1.82],[2018,2,'mutuo_ipotecario',1.85],[2018,3,'mutuo_ipotecario',1.90],[2018,4,'mutuo_ipotecario',1.95],
    [2019,1,'mutuo_ipotecario',1.98],[2019,2,'mutuo_ipotecario',1.95],[2019,3,'mutuo_ipotecario',1.90],[2019,4,'mutuo_ipotecario',1.85],
    [2020,1,'mutuo_ipotecario',1.80],[2020,2,'mutuo_ipotecario',1.75],[2020,3,'mutuo_ipotecario',1.70],[2020,4,'mutuo_ipotecario',1.68],
    [2021,1,'mutuo_ipotecario',1.65],[2021,2,'mutuo_ipotecario',1.62],[2021,3,'mutuo_ipotecario',1.60],[2021,4,'mutuo_ipotecario',1.65],
    [2022,1,'mutuo_ipotecario',1.80],[2022,2,'mutuo_ipotecario',2.20],[2022,3,'mutuo_ipotecario',2.80],[2022,4,'mutuo_ipotecario',3.40],
    [2023,1,'mutuo_ipotecario',4.00],[2023,2,'mutuo_ipotecario',4.30],[2023,3,'mutuo_ipotecario',4.60],[2023,4,'mutuo_ipotecario',4.80],
    [2024,1,'mutuo_ipotecario',5.00],[2024,2,'mutuo_ipotecario',5.10],[2024,3,'mutuo_ipotecario',5.20],[2024,4,'mutuo_ipotecario',5.30],
    [2025,1,'mutuo_ipotecario',5.20],[2025,2,'mutuo_ipotecario',5.10],[2025,3,'mutuo_ipotecario',5.00],[2025,4,'mutuo_ipotecario',4.90],
    [2026,1,'mutuo_ipotecario',4.80],[2026,2,'mutuo_ipotecario',4.70],
    [2005,1,'credito_consumo',9.50],[2005,2,'credito_consumo',9.40],[2005,3,'credito_consumo',9.30],[2005,4,'credito_consumo',9.20],
    [2006,1,'credito_consumo',9.10],[2006,2,'credito_consumo',9.00],[2006,3,'credito_consumo',9.10],[2006,4,'credito_consumo',9.20],
    [2007,1,'credito_consumo',9.30],[2007,2,'credito_consumo',9.40],[2007,3,'credito_consumo',9.50],[2007,4,'credito_consumo',9.60],
    [2008,1,'credito_consumo',9.70],[2008,2,'credito_consumo',9.80],[2008,3,'credito_consumo',9.90],[2008,4,'credito_consumo',9.70],
    [2009,1,'credito_consumo',9.50],[2009,2,'credito_consumo',9.20],[2009,3,'credito_consumo',9.00],[2009,4,'credito_consumo',8.90],
    [2010,1,'credito_consumo',8.80],[2010,2,'credito_consumo',8.70],[2010,3,'credito_consumo',8.60],[2010,4,'credito_consumo',8.70],
    [2011,1,'credito_consumo',8.80],[2011,2,'credito_consumo',9.00],[2011,3,'credito_consumo',9.20],[2011,4,'credito_consumo',9.40],
    [2012,1,'credito_consumo',9.50],[2012,2,'credito_consumo',9.60],[2012,3,'credito_consumo',9.50],[2012,4,'credito_consumo',9.40],
    [2013,1,'credito_consumo',9.30],[2013,2,'credito_consumo',9.20],[2013,3,'credito_consumo',9.10],[2013,4,'credito_consumo',9.00],
    [2014,1,'credito_consumo',8.90],[2014,2,'credito_consumo',8.80],[2014,3,'credito_consumo',8.70],[2014,4,'credito_consumo',8.60],
    [2015,1,'credito_consumo',8.50],[2015,2,'credito_consumo',8.40],[2015,3,'credito_consumo',8.30],[2015,4,'credito_consumo',8.20],
    [2016,1,'credito_consumo',8.10],[2016,2,'credito_consumo',8.00],[2016,3,'credito_consumo',7.90],[2016,4,'credito_consumo',7.80],
    [2017,1,'credito_consumo',7.70],[2017,2,'credito_consumo',7.65],[2017,3,'credito_consumo',7.60],[2017,4,'credito_consumo',7.55],
    [2018,1,'credito_consumo',7.50],[2018,2,'credito_consumo',7.55],[2018,3,'credito_consumo',7.60],[2018,4,'credito_consumo',7.65],
    [2019,1,'credito_consumo',7.70],[2019,2,'credito_consumo',7.65],[2019,3,'credito_consumo',7.60],[2019,4,'credito_consumo',7.55],
    [2020,1,'credito_consumo',7.50],[2020,2,'credito_consumo',7.40],[2020,3,'credito_consumo',7.30],[2020,4,'credito_consumo',7.20],
    [2021,1,'credito_consumo',7.10],[2021,2,'credito_consumo',7.05],[2021,3,'credito_consumo',7.00],[2021,4,'credito_consumo',7.10],
    [2022,1,'credito_consumo',7.20],[2022,2,'credito_consumo',7.50],[2022,3,'credito_consumo',7.90],[2022,4,'credito_consumo',8.40],
    [2023,1,'credito_consumo',8.80],[2023,2,'credito_consumo',9.10],[2023,3,'credito_consumo',9.40],[2023,4,'credito_consumo',9.60],
    [2024,1,'credito_consumo',9.80],[2024,2,'credito_consumo',9.90],[2024,3,'credito_consumo',10.00],[2024,4,'credito_consumo',10.10],
    [2025,1,'credito_consumo',10.00],[2025,2,'credito_consumo',9.90],[2025,3,'credito_consumo',9.80],[2025,4,'credito_consumo',9.70],
    [2026,1,'credito_consumo',9.60],[2026,2,'credito_consumo',9.50],
    [2005,1,'cqs',8.00],[2005,2,'cqs',7.90],[2005,3,'cqs',7.80],[2005,4,'cqs',7.70],
    [2006,1,'cqs',7.60],[2006,2,'cqs',7.50],[2006,3,'cqs',7.60],[2006,4,'cqs',7.70],
    [2007,1,'cqs',7.80],[2007,2,'cqs',7.90],[2007,3,'cqs',8.00],[2007,4,'cqs',8.10],
    [2008,1,'cqs',8.20],[2008,2,'cqs',8.30],[2008,3,'cqs',8.40],[2008,4,'cqs',8.20],
    [2009,1,'cqs',8.00],[2009,2,'cqs',7.80],[2009,3,'cqs',7.60],[2009,4,'cqs',7.50],
    [2010,1,'cqs',7.40],[2010,2,'cqs',7.30],[2010,3,'cqs',7.20],[2010,4,'cqs',7.30],
    [2011,1,'cqs',7.40],[2011,2,'cqs',7.60],[2011,3,'cqs',7.80],[2011,4,'cqs',8.00],
    [2012,1,'cqs',8.10],[2012,2,'cqs',8.20],[2012,3,'cqs',8.10],[2012,4,'cqs',8.00],
    [2013,1,'cqs',7.90],[2013,2,'cqs',7.80],[2013,3,'cqs',7.70],[2013,4,'cqs',7.60],
    [2014,1,'cqs',7.50],[2014,2,'cqs',7.40],[2014,3,'cqs',7.30],[2014,4,'cqs',7.20],
    [2015,1,'cqs',7.10],[2015,2,'cqs',7.00],[2015,3,'cqs',6.90],[2015,4,'cqs',6.80],
    [2016,1,'cqs',6.70],[2016,2,'cqs',6.60],[2016,3,'cqs',6.50],[2016,4,'cqs',6.40],
    [2017,1,'cqs',6.30],[2017,2,'cqs',6.25],[2017,3,'cqs',6.20],[2017,4,'cqs',6.15],
    [2018,1,'cqs',6.10],[2018,2,'cqs',6.15],[2018,3,'cqs',6.20],[2018,4,'cqs',6.25],
    [2019,1,'cqs',6.30],[2019,2,'cqs',6.25],[2019,3,'cqs',6.20],[2019,4,'cqs',6.15],
    [2020,1,'cqs',6.10],[2020,2,'cqs',6.00],[2020,3,'cqs',5.90],[2020,4,'cqs',5.85],
    [2021,1,'cqs',5.80],[2021,2,'cqs',5.75],[2021,3,'cqs',5.70],[2021,4,'cqs',5.80],
    [2022,1,'cqs',5.90],[2022,2,'cqs',6.20],[2022,3,'cqs',6.60],[2022,4,'cqs',7.10],
    [2023,1,'cqs',7.50],[2023,2,'cqs',7.80],[2023,3,'cqs',8.10],[2023,4,'cqs',8.30],
    [2024,1,'cqs',8.50],[2024,2,'cqs',8.60],[2024,3,'cqs',8.70],[2024,4,'cqs',8.80],
    [2025,1,'cqs',8.70],[2025,2,'cqs',8.60],[2025,3,'cqs',8.50],[2025,4,'cqs',8.40],
    [2026,1,'cqs',8.30],[2026,2,'cqs',8.20]
  ];

  for (const [anno, trim, tipo, tegm] of soglie) {
    let soglia, formula;
    if (anno < 2011) { soglia = tegm * 1.5; formula = 'TEGM*1.5'; }
    else { soglia = tegm + Math.min(tegm * 0.25 + 4, 8); formula = 'TEGM+25%+4pp'; }
    const dp = `${anno}-${String((trim-1)*3+1).padStart(2,'0')}-01`;
    db.run(
      `INSERT INTO soglie_usura (anno,trimestre,tipo_contratto,tegm,tasso_soglia,formula_calcolo,data_pubblicazione,hash_dataset) VALUES (${anno},${trim},'${tipo}',${tegm},${parseFloat(soglia.toFixed(4))},'${formula}','${dp}','seed_v2')`
    );
  }
  db.run("COMMIT");
  const cnt = db.exec("SELECT COUNT(*) FROM soglie_usura");
  console.log(`✅ Inserite ${cnt[0].values[0][0]} soglie usura (2005-2026)`);

  // 3. REGOLE NORMATIVE
  console.log('\n📜 Inserimento regole normative...');
  db.run("DELETE FROM regole_normative");
  db.run("BEGIN");
  const regole = [
    ['R001','Spese istruttoria incluse nel TEG se anticipate','inclusione','{"anticipate":true}',1,null,null],
    ['R002','Polizza esclusa se non obbligatoria','esclusione','{"obbligatoria":false}',1,null,null],
    ['R003','CMS escluse dal TEGM','esclusione','{"tipo":"cms"}',1,null,null],
    ['R004','Moratori = soglia + 2%','soglia','{"delta":0.02,"max":0.08}',1,null,null],
    ['R005','Ricalcolo TEG actual/365','calcolo','{"base_giorni":365}',1,null,null]
  ];
  for (const r of regole) {
    db.run(`INSERT INTO regole_normative (codice_regola,descrizione,tipo_regola,parametri,attiva,valid_from,valid_to) VALUES ('${r[0]}','${r[1]}','${r[2]}','${r[3]}',${r[4]},${r[5]?`'${r[5]}'`:'null'},${r[6]?`'${r[6]}'`:'null'})`);
  }
  db.run("COMMIT");
  console.log('✅ Inserite 5 regole normative');

  // 4. CONFIG
  console.log('\n⚙️ Configurazione...');
  db.run("DELETE FROM config_app");
  db.run("BEGIN");
  const config = [
    ['versione_engine','1.2.0'],
    ['ultimo_update_soglie', new Date().toISOString()],
    ['enable_realtime_market','false'],
    ['db_schema_version','1.0'],
    ['ultimo_hash_soglie','seed_v2']
  ];
  for (const [k,v] of config) {
    db.run(`INSERT INTO config_app (chiave,valore) VALUES ('${k}','${v}')`);
  }
  db.run("COMMIT");
  console.log('✅ Configurazione salvata');

  // 5. VERIFICA
  const check = db.exec("SELECT anno, tipo_contratto, COUNT(*) FROM soglie_usura GROUP BY anno, tipo_contratto ORDER BY anno DESC LIMIT 6");
  if (check.length > 0) {
    console.log('\n📊 Verifica soglie (ultime):');
    check[0].values.forEach(r => console.log(`  ${r[0]} ${r[1]}: ${r[2]} record`));
  }

  dbManager.save();
  dbManager.close();
  console.log('\n✅ Database inizializzato con successo!');
  process.exit(0);
}

initCompleteDatabase().catch(err => {
  console.error('\n❌ Errore fatal:', err);
  process.exit(1);
});