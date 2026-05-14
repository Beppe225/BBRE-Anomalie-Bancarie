/**
 * BBRE Anomalie Bancarie — Soglie Updater
 * Aggiornamento automatico soglie usura da CSV/XLS Banca d'Italia
 *
 * Viene chiamato in background ad ogni avvio dell'app.
 * NON blocca mai l'avvio, NON crasha mai, gestisce tutto silenziosamente.
 *
 * Uso: const { controlla_e_aggiorna_soglie } = require('./soglie_updater');
 *       controlla_e_aggiorna_soglie(db).then(r => console.log(r));
 */

'use strict';

const crypto = require('crypto');

// node-fetch v2 (CommonJS)
const fetch = require('node-fetch');
const XLSX  = require('xlsx');

// ─────────────────────────────────────────────────────────────────
// Costanti
// ─────────────────────────────────────────────────────────────────
const BI_PAGE_URL   = 'https://www.bancaditalia.it/compiti/vigilanza/compiti-vigilanza/tegm/index.html';
const BI_BASE_URL   = 'https://www.bancaditalia.it';
const FETCH_TIMEOUT = 10000;  // 10 secondi per la pagina
const DL_TIMEOUT    = 15000;  // 15 secondi per il download
const VERSIONE_TOOL = '1.0';

// Mapping nomi colonna attesi nel file Banca d'Italia
// (possono variare leggermente — proviamo più varianti)
const COL_ANNO        = ['anno', 'year', 'ANNO'];
const COL_TRIMESTRE   = ['trimestre', 'quarter', 'TRIMESTRE', 'trim'];
const COL_CATEGORIA   = ['categoria', 'category', 'CATEGORIA', 'classe operazioni'];
const COL_TEGM        = ['tegm', 'tasso medio', 'TEGM', 'tasso effettivo globale medio'];
const COL_SOGLIA      = ['tasso soglia', 'soglia', 'SOGLIA', 'tasso di soglia'];

// ─────────────────────────────────────────────────────────────────
// Utilità
// ─────────────────────────────────────────────────────────────────

function log(msg) {
  const ts = new Date().toISOString().substring(0, 19);
  console.log(`[SoglieUpdater ${ts}] ${msg}`);
}

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function calcolaSoglia(tegm, dataInizio) {
  const data   = new Date(dataInizio);
  const cutoff = new Date('2011-05-14');
  if (data < cutoff) {
    return { tasso_soglia: parseFloat((tegm * 1.5).toFixed(4)), formula: 'vecchia' };
  }
  const delta = Math.min(tegm * 0.25 + 4, 8);
  return { tasso_soglia: parseFloat((tegm + delta).toFixed(4)), formula: 'nuova' };
}

function datesTrimestre(anno, trimestre) {
  const map = {
    1: [`${anno}-01-01`, `${anno}-03-31`],
    2: [`${anno}-04-01`, `${anno}-06-30`],
    3: [`${anno}-07-01`, `${anno}-09-30`],
    4: [`${anno}-10-01`, `${anno}-12-31`]
  };
  return map[trimestre] || [null, null];
}

/** Normalizza un nome colonna per il confronto */
function normCol(s) {
  return String(s || '').toLowerCase().trim().replace(/\s+/g, ' ');
}

/** Trova il nome effettivo di una colonna in un header row */
function findCol(headerRow, candidates) {
  const keys = Object.keys(headerRow);
  for (const k of keys) {
    const normalized = normCol(k);
    if (candidates.some(c => normalized.includes(normCol(c)))) return k;
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────
// STEP 1 — Trova URL del file CSV/XLS sulla pagina Banca d'Italia
// ─────────────────────────────────────────────────────────────────
async function trovaCsvUrl() {
  const ctrl    = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT);

  try {
    const res  = await fetch(BI_PAGE_URL, { signal: ctrl.signal });
    const html = await res.text();

    // Cerca href che contiene 'TEGM' e termina con .csv o .xls o .xlsx
    // Banca d'Italia usa tipicamente: href="...TEGM_SERIE STORICA.CSV"
    const pattern = /href=["']([^"']*tegm[^"']*\.(csv|xls|xlsx))["']/gi;
    let match;
    const candidates = [];
    while ((match = pattern.exec(html)) !== null) {
      candidates.push(match[1]);
    }

    if (candidates.length === 0) {
      log('WARN: nessun link CSV/XLS trovato sulla pagina Banca d\'Italia');
      return null;
    }

    // Prendi il primo match — di solito è la serie storica completa
    let url = candidates[0];
    if (!url.startsWith('http')) {
      url = url.startsWith('/') ? BI_BASE_URL + url : BI_BASE_URL + '/' + url;
    }
    log(`Trovato file: ${url}`);
    return url;

  } catch (err) {
    if (err.name === 'AbortError') {
      log('WARN: timeout fetch pagina Banca d\'Italia (offline?)');
    } else {
      log(`WARN: errore fetch pagina: ${err.message}`);
    }
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

// ─────────────────────────────────────────────────────────────────
// STEP 2 — Scarica il file e calcola hash SHA256
// ─────────────────────────────────────────────────────────────────
async function scaricaFile(url) {
  const ctrl    = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), DL_TIMEOUT);

  try {
    const res    = await fetch(url, { signal: ctrl.signal });
    const buffer = await res.buffer();
    const hash   = sha256(buffer);
    log(`File scaricato: ${buffer.length} bytes, hash: ${hash.substring(0, 16)}...`);
    return { buffer, hash };
  } catch (err) {
    if (err.name === 'AbortError') {
      log('WARN: timeout download file (offline?)');
    } else {
      log(`WARN: errore download: ${err.message}`);
    }
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

// ─────────────────────────────────────────────────────────────────
// STEP 3 — Parsing CSV/XLS
// ─────────────────────────────────────────────────────────────────
function parseFile(buffer, url) {
  try {
    // Determina tipo dal URL
    const isCsv = url.toLowerCase().endsWith('.csv');

    let wb;
    if (isCsv) {
      // CSV: prova separatore ; poi ,
      const text = buffer.toString('utf8');
      wb = XLSX.read(text, { type: 'string', FS: ';' });
      if (!wb.SheetNames.length) {
        wb = XLSX.read(text, { type: 'string', FS: ',' });
      }
    } else {
      // XLS/XLSX
      wb = XLSX.read(buffer, { type: 'buffer' });
    }

    if (!wb.SheetNames.length) {
      log('WARN: file vuoto o struttura non riconosciuta');
      return null;
    }

    const ws   = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { defval: null });

    if (!rows.length) {
      log('WARN: nessuna riga nel foglio');
      return null;
    }

    // Identifica colonne
    const headerRow = rows[0];
    const colAnno      = findCol(headerRow, COL_ANNO);
    const colTrimestre = findCol(headerRow, COL_TRIMESTRE);
    const colCategoria = findCol(headerRow, COL_CATEGORIA);
    const colTegm      = findCol(headerRow, COL_TEGM);
    const colSoglia    = findCol(headerRow, COL_SOGLIA);

    if (!colAnno || !colCategoria || !colTegm) {
      log(`WARN: struttura file Banca d'Italia cambiata — aggiornare parser. Colonne trovate: ${Object.keys(headerRow).join(', ')}`);
      return null;
    }

    log(`Parsing: ${rows.length} righe, colonne: anno=${colAnno}, trim=${colTrimestre}, cat=${colCategoria}, tegm=${colTegm}`);

    const records = [];
    for (const row of rows) {
      const anno      = parseInt(row[colAnno]);
      const trimestre = colTrimestre ? parseInt(row[colTrimestre]) : 1;
      const categoria = String(row[colCategoria] || '').trim();
      const tegm      = parseFloat(String(row[colTegm] || '').replace(',', '.'));

      if (!anno || !categoria || isNaN(tegm)) continue;
      if (anno < 1997 || anno > 2040) continue;
      if (trimestre < 1 || trimestre > 4) continue;

      records.push({ anno, trimestre, categoria, tegm });
    }

    log(`Parsing completato: ${records.length} record validi`);
    return records;

  } catch (err) {
    log(`WARN: errore parsing file: ${err.message}`);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────
// STEP 4 — Import righe nuove nel DB
// ─────────────────────────────────────────────────────────────────
function importaRigheNuove(db, records, hashFile) {
  const insertStmt = db.prepare(`
    INSERT OR IGNORE INTO soglie_usura (
      anno, trimestre, data_inizio, data_fine, categoria,
      classe_importo_min, classe_importo_max,
      tegm, tasso_soglia, formula_applicata,
      fonte_gazzetta, data_importazione, versione_dataset, note
    ) VALUES (
      @anno, @trimestre, @data_inizio, @data_fine, @categoria,
      NULL, NULL,
      @tegm, @tasso_soglia, @formula_applicata,
      @fonte_gazzetta, @data_importazione, @versione_dataset,
      @note
    )
  `);

  const importAll = db.transaction((recs) => {
    let nuove = 0;
    const now = new Date().toISOString();

    for (const { anno, trimestre, categoria, tegm } of recs) {
      const [data_inizio, data_fine] = datesTrimestre(anno, trimestre);
      if (!data_inizio) continue;

      const { tasso_soglia, formula } = calcolaSoglia(tegm, data_inizio);

      const result = insertStmt.run({
        anno, trimestre, data_inizio, data_fine, categoria,
        tegm, tasso_soglia,
        formula_applicata: formula,
        fonte_gazzetta:    'Banca d\'Italia — import automatico',
        data_importazione: now,
        versione_dataset:  hashFile.substring(0, 16),
        note:              `Import automatico da CSV BI — hash: ${hashFile.substring(0, 16)}`
      });

      if (result.changes > 0) nuove++;
    }
    return nuove;
  });

  return importAll(records);
}

// ─────────────────────────────────────────────────────────────────
// STEP 5 — Recupera stato corrente dal DB
// ─────────────────────────────────────────────────────────────────
function getStatoAttuale(db) {
  try {
    const row = db.prepare(`
      SELECT versione_dataset, MAX(data_importazione) as ultima_importazione
      FROM soglie_usura
      WHERE data_importazione IS NOT NULL
      ORDER BY data_importazione DESC
      LIMIT 1
    `).get();
    return row || { versione_dataset: null, ultima_importazione: null };
  } catch {
    return { versione_dataset: null, ultima_importazione: null };
  }
}

// ─────────────────────────────────────────────────────────────────
// FUNZIONE PRINCIPALE
// ─────────────────────────────────────────────────────────────────
/**
 * Controlla e aggiorna le soglie usura dal sito Banca d'Italia.
 * Asincrona, non blocca mai, non crasha mai.
 *
 * @param {Database} db — istanza better-sqlite3
 * @returns {Promise<{aggiornato, nuove_righe, versione_attuale, errore}>}
 */
async function controlla_e_aggiorna_soglie(db) {
  const risultato = {
    aggiornato:       false,
    nuove_righe:      0,
    versione_attuale: null,
    errore:           null
  };

  try {
    log('Avvio controllo aggiornamenti soglie...');

    // STEP 1 — Trova URL
    const csvUrl = await trovaCsvUrl();
    if (!csvUrl) {
      risultato.errore = 'Impossibile trovare il file soglie su Banca d\'Italia (offline?)';
      return risultato;
    }

    // STEP 2 — Scarica e calcola hash
    const fileData = await scaricaFile(csvUrl);
    if (!fileData) {
      risultato.errore = 'Impossibile scaricare il file soglie';
      return risultato;
    }

    // Confronta hash con ultimo import
    const statoAttuale = getStatoAttuale(db);
    if (statoAttuale.versione_dataset &&
        fileData.hash.startsWith(statoAttuale.versione_dataset)) {
      log('Hash identico — nessuna novità, uscita silenziosa');
      risultato.versione_attuale = statoAttuale.versione_dataset;
      return risultato;
    }

    // STEP 3 — Parsing
    const records = parseFile(fileData.buffer, csvUrl);
    if (!records) {
      risultato.errore = 'Struttura file Banca d\'Italia cambiata — aggiornare parser manualmente';
      // Salva flag errore in DB per mostrarlo in UI
      try {
        db.prepare(`
          INSERT OR REPLACE INTO regole_normative (codice, titolo, tipo, contenuto_testo,
            attiva, versione, note_redazionali)
          VALUES ('SYS_UPDATE_ERROR', 'Errore aggiornamento soglie', 'soglia',
            @testo, 0, '1.0', @nota)
        `).run({
          testo: risultato.errore,
          nota:  new Date().toISOString()
        });
      } catch { /* ignora errori DB secondari */ }
      return risultato;
    }

    // STEP 4 — Import righe nuove
    const nuove = importaRigheNuove(db, records, fileData.hash);
    log(`Importate ${nuove} nuove righe soglie`);

    risultato.aggiornato       = nuove > 0;
    risultato.nuove_righe      = nuove;
    risultato.versione_attuale = fileData.hash.substring(0, 16);

    return risultato;

  } catch (err) {
    // Catch globale — mai crash
    log(`ERRORE non gestito: ${err.message}`);
    risultato.errore = err.message;
    return risultato;
  }
}

module.exports = { controlla_e_aggiorna_soglie };
