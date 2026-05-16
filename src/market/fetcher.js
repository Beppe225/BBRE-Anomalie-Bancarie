/**
 * fetcher.js — Dati mercato real-time
 * EURIBOR 3M: BCE Statistical Data Warehouse (API pubblica, no key)
 * TEGM:       DB interno BBRE (soglie_usura più recenti)
 */

'use strict';

const fetch = require('node-fetch');

const TTL_MS = 4 * 60 * 60 * 1000; // cache 4 ore

let cache = { data: null, timestamp: 0 };

// ── EURIBOR 3M da BCE ────────────────────────────────────────────────────────
async function fetchEuribor3M() {
  try {
    const url = 'https://data-api.ecb.europa.eu/service/data/FM/M.U2.EUR.RT.MM.EURIBOR3MD_.HSTA?lastNObservations=1&format=csvdata';
    const res  = await fetch(url, { timeout: 8000 });
    if (!res.ok) throw new Error(`BCE HTTP ${res.status}`);

    const text  = await res.text();
    const lines = text.trim().split('\n');
    if (lines.length < 2) throw new Error('BCE: risposta vuota');

    const headers = lines[0].split(',');
    const values  = lines[1].split(',');
    const row     = {};
    headers.forEach((h, i) => row[h.trim()] = (values[i] || '').trim());

    const valore  = parseFloat(row['OBS_VALUE']);
    const periodo = row['TIME_PERIOD'] || '';
    if (isNaN(valore)) throw new Error('BCE: OBS_VALUE non parsabile');

    return { valore, periodo, fonte: 'BCE SDW' };
  } catch (err) {
    console.warn('⚠️  Fetch EURIBOR BCE fallito:', err.message);
    return null;
  }
}

// ── TEGM dal DB interno ───────────────────────────────────────────────────────
function getTEGMdaDB() {
  try {
    if (!global.dbManager) return null;
    const db = global.dbManager.getDb();
    if (!db) return null;

    // Prende il TEGM più recente per mutuo ipotecario
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
      tegm_mutuo:    parseFloat(tegm),
      soglia_mutuo:  parseFloat(soglia),
      periodo:       `${anno} T${trim}`,
      fonte:         'DB BBRE (Banca d\'Italia)'
    };
  } catch (err) {
    console.warn('⚠️  Lettura TEGM da DB fallita:', err.message);
    return null;
  }
}

// ── ENTRY POINT ──────────────────────────────────────────────────────────────
async function getMarketData() {
  const now = Date.now();

  // Ritorna dalla cache se ancora fresca
  if (cache.data && (now - cache.timestamp < TTL_MS)) {
    return { ...cache.data, fromCache: true };
  }

  console.log('🌐 Aggiornamento dati mercato...');

  const [euribor, tegmDB] = await Promise.all([
    fetchEuribor3M(),
    Promise.resolve(getTEGMdaDB())
  ]);

  const data = {
    euribor_3m:         euribor ? euribor.valore               : null,
    euribor_periodo:    euribor ? euribor.periodo               : null,
    euribor_fonte:      euribor ? euribor.fonte                 : null,
    tegm_corrente:      tegmDB  ? tegmDB.tegm_mutuo             : null,
    soglia_corrente:    tegmDB  ? tegmDB.soglia_mutuo           : null,
    tegm_periodo:       tegmDB  ? tegmDB.periodo                : null,
    tegm_fonte:         tegmDB  ? tegmDB.fonte                  : null,
    timestamp:          new Date().toISOString(),
    aggiornato:         !!(euribor || tegmDB)
  };

  cache.data      = data;
  cache.timestamp = now;

  console.log('✅ Dati mercato aggiornati — EURIBOR:', data.euribor_3m, '| TEGM:', data.tegm_corrente);
  return { ...data, fromCache: false };
}

// Invalida cache (chiamato dopo aggiornamento soglie)
function invalidaCache() {
  cache = { data: null, timestamp: 0 };
}

module.exports = { getMarketData, invalidaCache };
