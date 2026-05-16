/**
 * fetcher.js — Dati mercato
 * TEGM/Soglia: DB interno (sempre disponibile, immediato)
 * EURIBOR 3M:  BCE SDW API (tenta fetch, fallback a stima da soglie DB)
 */

'use strict';

const https = require('https');

const TTL_MS = 4 * 60 * 60 * 1000; // cache 4 ore

let cache = { data: null, timestamp: 0 };

// ── HTTP GET nativo Node ──────────────────────────────────────────────────────
function httpGet(url, timeoutMs = 12000) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout: timeoutMs }, (res) => {
      // Segui redirect
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return httpGet(res.headers.location, timeoutMs).then(resolve).catch(reject);
      }
      let body = '';
      res.setEncoding('utf8');
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) resolve(body);
        else reject(new Error(`HTTP ${res.statusCode}`));
      });
    });
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    req.on('error', reject);
  });
}

// ── TEGM e Soglia dal DB (fonte primaria, sempre disponibile) ─────────────────
function getDatiDB() {
  try {
    if (!global.dbManager) return null;
    const db = global.dbManager.getDb();
    if (!db) return null;

    const res = db.exec(`
      SELECT tegm, tasso_soglia, anno, trimestre
      FROM soglie_usura
      WHERE tipo_contratto = 'mutuo_ipotecario'
      ORDER BY anno DESC, trimestre DESC
      LIMIT 1
    `);
    if (!res.length || !res[0].values.length) return null;

    const [tegm, soglia, anno, trim] = res[0].values[0];
    return {
      tegm_mutuo:   parseFloat(tegm),
      soglia_mutuo: parseFloat(soglia),
      periodo:      `${anno} T${trim}`,
      fonte:        "Banca d'Italia"
    };
  } catch (err) {
    console.warn('⚠️  DB mercato:', err.message);
    return null;
  }
}

// ── EURIBOR 3M da BCE (tenta, non blocca) ────────────────────────────────────
async function fetchEuribor3M() {
  // Due endpoint BCE: nuovo e vecchio SDW (fallback)
  const urls = [
    'https://data-api.ecb.europa.eu/service/data/FM/M.U2.EUR.RT.MM.EURIBOR3MD_.HSTA?lastNObservations=1&format=csvdata',
    'https://sdw-wsrest.ecb.europa.eu/service/data/FM/M.U2.EUR.RT.MM.EURIBOR3MD_.HSTA?lastNObservations=1&format=csvdata'
  ];
  for (const url of urls) {
  try {
    const text  = await httpGet(url, 8000);
    const lines = text.trim().split('\n');
    if (lines.length < 2) throw new Error('Risposta vuota');

    const headers = lines[0].split(',').map(h => h.trim().replace(/\r/g, ''));
    const values  = lines[1].split(',').map(v => v.trim().replace(/\r/g, ''));
    const row     = {};
    headers.forEach((h, i) => row[h] = values[i] || '');

    const valore = parseFloat(row['OBS_VALUE']);
    if (isNaN(valore)) throw new Error('Valore non valido');

    console.log('✅ EURIBOR BCE:', valore, '%', row['TIME_PERIOD'], '|', url.includes('sdw-wsrest') ? 'legacy' : 'new');
    return { valore, periodo: row['TIME_PERIOD'] || '', fonte: 'BCE SDW' };
  } catch (err) {
    console.warn('⚠️  Endpoint fallito:', url.substring(0,50), err.message);
    // continua con prossimo endpoint
  }
  } // fine for
  return null;
}

// ── ENTRY POINT ───────────────────────────────────────────────────────────────
async function getMarketData() {
  const now = Date.now();

  if (cache.data && (now - cache.timestamp < TTL_MS)) {
    return { ...cache.data, fromCache: true };
  }

  console.log('🌐 Aggiornamento dati mercato...');

  // DB è immediato — non aspettiamo BCE per mostrare qualcosa
  const db = getDatiDB();

  // BCE in parallelo con timeout generoso
  const euribor = await fetchEuribor3M();

  // Se BCE non risponde, stima EURIBOR da spread tipico sul TEGM
  // (approssimazione: EURIBOR ≈ TEGM mutui - 3.5pp spread medio storico)
  let euriborVal    = euribor ? euribor.valore  : null;
  let euriborPer    = euribor ? euribor.periodo : null;
  let euriborFonte  = euribor ? euribor.fonte   : null;

  if (!euribor && db) {
    // Fallback: stima da spread storico Euribor/TEGM
    euriborVal   = Math.max(0, parseFloat((db.tegm_mutuo - 3.5).toFixed(3)));
    euriborPer   = db.periodo;
    euriborFonte = 'Stima (BCE non raggiungibile)';
    console.log('📊 EURIBOR stimato dal DB:', euriborVal, '%');
  }

  const data = {
    euribor_3m:      euriborVal,
    euribor_periodo: euriborPer,
    euribor_fonte:   euriborFonte,
    tegm_corrente:   db ? db.tegm_mutuo   : null,
    soglia_corrente: db ? db.soglia_mutuo : null,
    tegm_periodo:    db ? db.periodo      : null,
    tegm_fonte:      db ? db.fonte        : null,
    timestamp:       new Date().toISOString(),
    aggiornato:      !!(euribor || db)
  };

  cache.data      = data;
  cache.timestamp = now;

  console.log('✅ Widget dati:', JSON.stringify({
    euribor: data.euribor_3m,
    tegm: data.tegm_corrente,
    soglia: data.soglia_corrente
  }));

  return { ...data, fromCache: false };
}

function invalidaCache() {
  cache = { data: null, timestamp: 0 };
}

module.exports = { getMarketData, invalidaCache };
