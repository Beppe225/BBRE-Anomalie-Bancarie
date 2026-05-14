const initSql = require('sql.js');
const fs = require('fs');

initSql().then(SQL => {
  const dbFile = fs.readFileSync('data/bbre.db');
  const db = new SQL.Database(dbFile);

  db.run('BEGIN');
  
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
    [2022,1,'credito_consumo',7.20],[2022,2,'credito_consumo',7.50],[2022,3,'credito_consumo',7.90],[2022,4,'credito_consumo',8.40],
    [2023,1,'credito_consumo',8.80],[2023,2,'credito_consumo',9.10],[2023,3,'credito_consumo',9.40],[2023,4,'credito_consumo',9.60],
    [2024,1,'credito_consumo',9.80],[2024,2,'credito_consumo',9.90],[2024,3,'credito_consumo',10.00],[2024,4,'credito_consumo',10.10],
    [2025,1,'credito_consumo',10.00],[2025,2,'credito_consumo',9.90],[2025,3,'credito_consumo',9.80],[2025,4,'credito_consumo',9.70],
    [2026,1,'credito_consumo',9.60],[2026,2,'credito_consumo',9.50],
    [2022,1,'cqs',5.90],[2022,2,'cqs',6.20],[2022,3,'cqs',6.60],[2022,4,'cqs',7.10],
    [2023,1,'cqs',7.50],[2023,2,'cqs',7.80],[2023,3,'cqs',8.10],[2023,4,'cqs',8.30],
    [2024,1,'cqs',8.50],[2024,2,'cqs',8.60],[2024,3,'cqs',8.70],[2024,4,'cqs',8.80],
    [2025,1,'cqs',8.70],[2025,2,'cqs',8.60],[2025,3,'cqs',8.50],[2025,4,'cqs',8.40],
    [2026,1,'cqs',8.30],[2026,2,'cqs',8.20]
  ];

  for (const [anno,trim,tipo,tegm] of soglie) {
    let soglia, formula;
    if (anno < 2011) { soglia = tegm*1.5; formula='TEGM*1.5'; }
    else { soglia = tegm+Math.min(tegm*0.25+4,8); formula='TEGM+25%+4pp'; }
    const dp = anno+'-'+String((trim-1)*3+1).padStart(2,'0')+'-01';
    db.run('INSERT OR IGNORE INTO soglie_usura (anno,trimestre,tipo_contratto,tegm,tasso_soglia,formula_calcolo,data_pubblicazione,hash_dataset) VALUES (?,?,?,?,?,?,?,?)',
      [anno,trim,tipo,tegm,parseFloat(soglia.toFixed(4)),formula,dp,'seed_v2']);
  }

  db.run('COMMIT');
  const cnt = db.exec('SELECT COUNT(*) FROM soglie_usura');
  console.log('Soglie nel DB:', cnt[0].values[0][0]);
  const sample = db.exec("SELECT anno,trimestre,tipo_contratto,tasso_soglia FROM soglie_usura WHERE anno=2022 AND trimestre=1 AND tipo_contratto='mutuo_ipotecario'");
  console.log('Verifica 2022 Q1 mutuo:', JSON.stringify(sample[0].values));
  fs.writeFileSync('data/bbre.db', Buffer.from(db.export()));
  console.log('DB salvato OK');
});
