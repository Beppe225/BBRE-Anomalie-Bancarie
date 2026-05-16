/**
 * fetcher.js — Dati mercato real-time
 * EURIBOR 3M: BCE Statistical Data Warehouse (API pubblica, no key)
 * TEGM:       DB interno BBRE (soglie_usura più recenti)
 */

'use strict';

const https = require('https');

const TTL_MS = 4 * 60 * 60 * 1000; // cache 4 ore

let cache = { data: null, timestamp: 0 };

// ── HTTP GET nativo Node (niente node-fetch, niente dipendenze) ────────────────
function httpGet(url, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout: timeoutMs }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(body);
        } else {
          reject(new Error(`HTTP ${res.statusCode}`));
        }
      });
    });
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    req.on('error', reject);
  });
}

// ── EURIBOR 3M da BCE SDW ────────────────────────────────────────────────────
async function fetchEuribor3M() {
  const url = 'https://data-api.ecb.europa.eu/service/data/FM/M.U2.EUR.RT.MM.EURIBOR3MD_.HSTA?lastNObservations=1&format=csvdata';
  try {
    const text  = await httpGet(url, 12000);
    const lines = text.trim().split('\n');
    if (lines.length < 2) throw new Error('Risposta vuota');

    const headers = lines[0].split(',').map(h => h.trim().replace(/\r/g,''));
    const values  = lines[1].split(',').map(v => v.trim().replace(/\r/g,''));
    const row     = {};
    headers.forEach((h, i) => row[h] = values[i] || '');

    const valore  = parseFloat(row['OBS_VALUE']);
    const periodo = row['TIME_PERIOD'] || '';
    if (isNaN(valore)) throw new Error('OBS_VALUE non parsabile: ' + row['OBS_VALUE']);

    console.log('✅ EURIBOR 3M BCE:', valore, '%', periodo);
    return { valore, periodo, fonte: 'BCE SDW' };
  } catch (err) {
    console.warn('⚠️  Fetch EURIBOR BCE fallito:', err.message);
    return null;
  }
}

// ── TEGM e Soglia dal DB interno ─────────────────────────────────────────────
function getTEGMdaDB() {
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
    console.log('✅ TEGM da DB:', tegm, '%  Soglia:', soglia, '%  Periodo:', anno, 'T'+trim);
    return {
      tegm_mutuo:   parseFloat(tegm),
      soglia_mutuo: parseFloat(soglia),
      periodo:      `${anno} T${trim}`,
      fonte:        "Banca d'Italia (DB BBRE)"
    };
  } catch (err) {
    console.warn('⚠️  Lettura TEGM da DB:', err.message);
    return null;
  }
}

// ── ENTRY POINT ───────────────────────────────────────────────────────────────
async function getMarketData() {
  const now = Date.now();

  if (cache.data && (now - cache.timestamp < TTL_MS)) {
    return { ...cache.data, fromCache: true };
  }

  console.log('🌐 Aggiornamento dati mercato...');

  // Lancia EURIBOR e TEGM in parallelo
  const [euribor, tegmDB] = await Promise.all([
    fetchEuribor3M(),
    Promise.resolve(getTEGMdaDB())
  ]);

  const data = {
    euribor_3m:       euribor ? euribor.valore      : null,
    euribor_periodo:  euribor ? euribor.periodo      : null,
    euribor_fonte:    euribor ? euribor.fonte        : null,
    tegm_corrente:    tegmDB  ? tegmDB.tegm_mutuo    : null,
    soglia_corrente:  tegmDB  ? tegmDB.soglia_mutuo  : null,
    tegm_periodo:     tegmDB  ? tegmDB.periodo       : null,
    tegm_fonte:       tegmDB  ? tegmDB.fonte         : null,
    timestamp:        new Date().toISOString(),
    aggiornato:       !!(euribor || tegmDB)
  };

  cache.data      = data;
  cache.timestamp = now;

  return { ...data, fromCache: false };
}

function invalidaCache() {
  cache = { data: null, timestamp: 0 };
}

module.exports = { getMarketData, invalidaCache };
