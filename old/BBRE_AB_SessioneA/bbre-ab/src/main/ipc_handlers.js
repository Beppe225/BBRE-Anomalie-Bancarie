/**
 * BBRE Anomalie Bancarie — IPC Handlers
 * Tutti gli handler ipcMain separati da main.js per leggibilità.
 * Importato e chiamato da main.js con registerHandlers(ipcMain).
 *
 * Sessione A: handlers DB base (contratti, voci, soglie, regole, config)
 * Sessione B: aggiungerà analisi:run (engine)
 * Sessione C: nessuna modifica — UI usa già questi handler
 * Sessione D: aggiungerà report:generate (PDF)
 */

'use strict';

const { shell }                     = require('electron');
const { getDb }                     = require('../db/db');
const { controlla_e_aggiorna_soglie } = require('../db/soglie_updater');
const { ENGINE_VERSION, DATASET_VERSION } = require('../config/config_manager');

/**
 * Registra tutti gli IPC handler.
 * @param {Electron.IpcMain} ipcMain
 */
function registerHandlers(ipcMain) {

  // ── APP ─────────────────────────────────────────────────────────
  ipcMain.handle('app:getVersion', (_, appVersion) => ({
    app:     appVersion || '1.0.0',
    engine:  ENGINE_VERSION,
    dataset: DATASET_VERSION
  }));

  ipcMain.handle('app:openExternal', (_, url) => {
    if (!url || (!url.startsWith('https://') && !url.startsWith('http://'))) return false;
    shell.openExternal(url);
    return true;
  });

  // ── CONFIG / STATO ──────────────────────────────────────────────
  ipcMain.handle('get_config', () => {
    const db = getDb();
    let ultimoAggiornamento = null;
    let versioneDataset     = DATASET_VERSION;

    try {
      const row = db.prepare(`
        SELECT MAX(data_importazione) as ultima, MAX(versione_dataset) as versione
        FROM soglie_usura WHERE data_importazione IS NOT NULL
      `).get();
      if (row) {
        ultimoAggiornamento = row.ultima;
        if (row.versione) versioneDataset = row.versione;
      }
    } catch { /* ignora */ }

    // Controlla se c'è un flag di errore aggiornamento
    let erroreAggiornamento = null;
    try {
      const errRow = db.prepare(
        "SELECT note_redazionali FROM regole_normative WHERE codice='SYS_UPDATE_ERROR' AND attiva=0"
      ).get();
      if (errRow) erroreAggiornamento = errRow.note_redazionali;
    } catch { /* ignora */ }

    return {
      versione_engine:      ENGINE_VERSION,
      versione_dataset:     versioneDataset,
      ultimo_aggiornamento: ultimoAggiornamento,
      errore_aggiornamento: erroreAggiornamento
    };
  });

  // ── AGGIORNAMENTO SOGLIE ─────────────────────────────────────────
  ipcMain.handle('controlla_aggiornamenti_soglie', async () => {
    const db = getDb();
    try {
      const risultato = await controlla_e_aggiorna_soglie(db);
      return risultato;
    } catch (err) {
      return { aggiornato: false, nuove_righe: 0, versione_attuale: null, errore: err.message };
    }
  });

  // ── CONTRATTI ───────────────────────────────────────────────────
  ipcMain.handle('salva_contratto', (_, data) => {
    const db = getDb();
    const stmt = db.prepare(`
      INSERT INTO contratti (tipo, data_stipula, capitale_erogato, tan_dichiarato,
        teg_dichiarato, durata_mesi, rata_mensile, ammortamento, note)
      VALUES (@tipo, @data_stipula, @capitale_erogato, @tan_dichiarato,
        @teg_dichiarato, @durata_mesi, @rata_mensile, @ammortamento, @note)
    `);
    const res = stmt.run(data);
    return { id: res.lastInsertRowid };
  });

  ipcMain.handle('contratti:list', () => {
    const db = getDb();
    return db.prepare('SELECT * FROM contratti ORDER BY created_at DESC').all();
  });

  ipcMain.handle('contratti:get', (_, id) => {
    const db = getDb();
    const c = db.prepare('SELECT * FROM contratti WHERE id = ?').get(id);
    if (!c) return null;
    c.voci = db.prepare('SELECT * FROM voci_costo WHERE contratto_id = ?').all(id);
    return c;
  });

  ipcMain.handle('contratti:update', (_, id, data) => {
    const db = getDb();
    const allowed = ['tipo','data_stipula','capitale_erogato','tan_dichiarato',
                     'teg_dichiarato','durata_mesi','rata_mensile','ammortamento','note'];
    const fields = Object.keys(data).filter(k => allowed.includes(k)).map(k => `${k}=@${k}`).join(', ');
    if (!fields) return { changes: 0 };
    return db.prepare(`UPDATE contratti SET ${fields} WHERE id=@id`).run({ ...data, id });
  });

  ipcMain.handle('contratti:delete', (_, id) => {
    return getDb().prepare('DELETE FROM contratti WHERE id=?').run(id);
  });

  // ── VOCI COSTO ──────────────────────────────────────────────────
  ipcMain.handle('salva_voci', (_, contrattoId, voci) => {
    const db = getDb();
    const insert = db.prepare(`
      INSERT INTO voci_costo (contratto_id, tipo_voce, descrizione,
        importo_totale, importo_annuo, condizionante, inclusa_teg_dichiarato, note)
      VALUES (@contratto_id, @tipo_voce, @descrizione,
        @importo_totale, @importo_annuo, @condizionante, @inclusa_teg_dichiarato, @note)
    `);
    const saveAll = db.transaction((items) => {
      // Prima elimina voci esistenti per questo contratto (replace logico)
      db.prepare('DELETE FROM voci_costo WHERE contratto_id = ?').run(contrattoId);
      for (const v of items) insert.run({ contratto_id: contrattoId, ...v });
      return { ok: true, count: items.length };
    });
    return saveAll(voci);
  });

  ipcMain.handle('voci:listByContratto', (_, cId) => {
    return getDb().prepare('SELECT * FROM voci_costo WHERE contratto_id = ?').all(cId);
  });

  ipcMain.handle('voci:create', (_, data) => {
    const db  = getDb();
    const res = db.prepare(`
      INSERT INTO voci_costo (contratto_id, tipo_voce, descrizione,
        importo_totale, importo_annuo, condizionante, inclusa_teg_dichiarato, note)
      VALUES (@contratto_id, @tipo_voce, @descrizione,
        @importo_totale, @importo_annuo, @condizionante, @inclusa_teg_dichiarato, @note)
    `).run(data);
    return { id: res.lastInsertRowid, ...data };
  });

  ipcMain.handle('voci:update', (_, id, data) => {
    const db     = getDb();
    const allowed = ['tipo_voce','descrizione','importo_totale','importo_annuo',
                     'condizionante','inclusa_teg_dichiarato','note'];
    const fields = Object.keys(data).filter(k => allowed.includes(k)).map(k => `${k}=@${k}`).join(', ');
    if (!fields) return { changes: 0 };
    return db.prepare(`UPDATE voci_costo SET ${fields} WHERE id=@id`).run({ ...data, id });
  });

  ipcMain.handle('voci:delete', (_, id) => {
    return getDb().prepare('DELETE FROM voci_costo WHERE id=?').run(id);
  });

  // ── SOGLIE ──────────────────────────────────────────────────────
  ipcMain.handle('soglie:find', (_, categoria, dataContratto) => {
    return getDb().prepare(`
      SELECT * FROM soglie_usura
      WHERE categoria = ?
        AND data_inizio <= ?
        AND data_fine   >= ?
      ORDER BY data_inizio DESC LIMIT 1
    `).get(categoria, dataContratto, dataContratto);
  });

  ipcMain.handle('soglie:list', (_, filters = {}) => {
    const db = getDb();
    let q = 'SELECT * FROM soglie_usura WHERE 1=1';
    const p = [];
    if (filters.categoria) { q += ' AND categoria=?'; p.push(filters.categoria); }
    if (filters.anno)       { q += ' AND anno=?';      p.push(filters.anno); }
    q += ' ORDER BY anno DESC, trimestre DESC, categoria';
    return db.prepare(q).all(...p);
  });

  // ── REGOLE NORMATIVE ────────────────────────────────────────────
  ipcMain.handle('regole:list', (_, tipo) => {
    const db = getDb();
    if (tipo) return db.prepare(
      'SELECT * FROM regole_normative WHERE tipo=? AND attiva=1 ORDER BY codice'
    ).all(tipo);
    return db.prepare('SELECT * FROM regole_normative WHERE attiva=1 ORDER BY codice').all();
  });

  ipcMain.handle('regole:getByCode', (_, codice) => {
    return getDb().prepare('SELECT * FROM regole_normative WHERE codice=?').get(codice);
  });

  // ── ANALISI ─────────────────────────────────────────────────────
  // Stub Sessione A — implementazione completa in Sessione B
  ipcMain.handle('esegui_analisi', (_, contrattoId) => {
    // TODO Sessione B: importare e chiamare orchestrator.js
    return { _stub: true, messaggio: 'Engine TEG non ancora implementato (Sessione B)', contratto_id: contrattoId };
  });

  ipcMain.handle('salva_analisi', (_, analisi) => {
    const db  = getDb();
    const res = db.prepare(`
      INSERT INTO analisi (contratto_id, teg_reale_calcolato, teg_dichiarato_ricalcolato,
        delta_vs_soglia, soglia_usura_id, score, score_fattori, affidabilita_analisi,
        polizza_condizionante_presente, moratori_in_anomalia,
        interessi_stimati_totali, recupero_stimato_min, recupero_stimato_max,
        warnings, note_analisi)
      VALUES (@contratto_id, @teg_reale_calcolato, @teg_dichiarato_ricalcolato,
        @delta_vs_soglia, @soglia_usura_id, @score, @score_fattori, @affidabilita_analisi,
        @polizza_condizionante_presente, @moratori_in_anomalia,
        @interessi_stimati_totali, @recupero_stimato_min, @recupero_stimato_max,
        @warnings, @note_analisi)
    `).run({
      contratto_id:                  analisi.contratto_id,
      teg_reale_calcolato:           analisi.teg_reale_calcolato           || null,
      teg_dichiarato_ricalcolato:    analisi.teg_dichiarato_ricalcolato    || null,
      delta_vs_soglia:               analisi.delta_vs_soglia               || null,
      soglia_usura_id:               analisi.soglia_usura_id               || null,
      score:                         analisi.score                         ?? null,
      score_fattori:                 analisi.score_fattori
                                       ? JSON.stringify(analisi.score_fattori) : null,
      affidabilita_analisi:          analisi.affidabilita_analisi          || null,
      polizza_condizionante_presente: analisi.polizza_condizionante_presente ? 1 : 0,
      moratori_in_anomalia:          analisi.moratori_in_anomalia          ? 1 : 0,
      interessi_stimati_totali:      analisi.interessi_stimati_totali      || null,
      recupero_stimato_min:          analisi.recupero_stimato_min          || null,
      recupero_stimato_max:          analisi.recupero_stimato_max          || null,
      warnings:                      analisi.warnings
                                       ? JSON.stringify(analisi.warnings) : null,
      note_analisi:                  analisi.note_analisi                  || null
    });
    return { id: res.lastInsertRowid };
  });

  ipcMain.handle('lista_analisi', (_, filtri = {}) => {
    const db = getDb();
    let q = `
      SELECT a.*, c.tipo as contratto_tipo, c.capitale_erogato, c.data_stipula
      FROM analisi a
      LEFT JOIN contratti c ON c.id = a.contratto_id
      WHERE 1=1
    `;
    const p = [];
    if (filtri.score !== undefined) { q += ' AND a.score=?'; p.push(filtri.score); }
    if (filtri.tipo)                { q += ' AND c.tipo=?';  p.push(filtri.tipo); }
    q += ' ORDER BY a.created_at DESC';
    if (filtri.limit) { q += ' LIMIT ?'; p.push(filtri.limit); }
    return db.prepare(q).all(...p);
  });

  ipcMain.handle('get_analisi', (_, id) => {
    const db = getDb();
    const a = db.prepare(`
      SELECT a.*, c.tipo as contratto_tipo, c.capitale_erogato, c.data_stipula,
             c.tan_dichiarato, c.teg_dichiarato, c.durata_mesi
      FROM analisi a
      LEFT JOIN contratti c ON c.id = a.contratto_id
      WHERE a.id = ?
    `).get(id);
    if (!a) return null;
    // Parse JSON fields
    if (a.score_fattori) try { a.score_fattori = JSON.parse(a.score_fattori); } catch { /**/ }
    if (a.warnings)      try { a.warnings      = JSON.parse(a.warnings);      } catch { /**/ }
    // Carica audit
    a.audit = db.prepare('SELECT * FROM audit_analisi WHERE analisi_id=? LIMIT 1').get(id);
    return a;
  });

  ipcMain.handle('analisi:delete', (_, id) => {
    return getDb().prepare('DELETE FROM analisi WHERE id=?').run(id);
  });

  // ── REPORT ──────────────────────────────────────────────────────
  // Stub Sessione A — implementazione completa in Sessione D
  ipcMain.handle('genera_report', (_, analisiId) => {
    // TODO Sessione D: importare e chiamare report_generator.js
    return { _stub: true, messaggio: 'Generazione PDF non ancora implementata (Sessione D)', analisi_id: analisiId };
  });

  ipcMain.handle('report:list', (_, analisiId) => {
    return getDb().prepare('SELECT * FROM report WHERE analisi_id=?').all(analisiId);
  });

  ipcMain.handle('report:open', (_, filePath) => {
    if (filePath) shell.openPath(filePath);
    return true;
  });

  // ── EXPORT CSV ──────────────────────────────────────────────────
  // Stub — implementazione in Sessione C
  ipcMain.handle('export_csv', (_, filtri) => {
    // TODO Sessione C: genera CSV delle analisi filtrate
    return { _stub: true, messaggio: 'Export CSV non ancora implementato (Sessione C)' };
  });

  // ── BACKUP DB ───────────────────────────────────────────────────
  ipcMain.handle('backup_db', () => {
    // TODO Sessione C: copia il file .sqlite in percorso scelto dall'utente
    return { _stub: true, messaggio: 'Backup DB non ancora implementato (Sessione C)' };
  });
}

module.exports = { registerHandlers };
