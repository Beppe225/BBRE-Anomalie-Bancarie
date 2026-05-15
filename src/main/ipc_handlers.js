/**
 * ipc_handlers.js - Handler IPC completi
 * Fix v1.1: aggiunti tutti gli handler mancanti
 */

const { ipcMain, dialog, app } = require('electron');
const { esegui_analisi } = require('../engine/orchestrator');
const { genera_pdf_buffer } = require('../reports/pdf_generator');
const path = require('path');
const fs   = require('fs');
const crypto = require('crypto');

function setupIpcHandlers() {
  console.log('🔌 Configurazione IPC Handlers...');

  // --- Helper ---
  function getDb() {
    if (!global.dbManager) throw new Error('Database non inizializzato. Riavvia l\'app.');
    const db = global.dbManager.getDb();
    if (!db) throw new Error('Database non disponibile.');
    return db;
  }

  // ── ANALISI ──────────────────────────────────────────────────────────────

  ipcMain.handle('esegui-analisi', async (event, payload) => {
    console.log('📥 Ricevuta richiesta analisi:', payload.contratto_id);
    try {
      const db = getDb();
      const risultato = await esegui_analisi(db, payload);
      console.log('✅ Analisi completata');
      return { successo: true, dati: risultato };
    } catch (err) {
      console.error('❌ Errore analisi:', err.message);
      return { successo: false, errore: err.message };
    }
  });

  // ── LISTA ANALISI ────────────────────────────────────────────────────────

  ipcMain.handle('lista-analisi', async (event, filtri = {}) => {
    try {
      const db = getDb();
      let query = "SELECT * FROM audit_analisi ORDER BY timestamp_analisi DESC";
      const res = db.exec(query);
      if (res.length === 0) return { successo: true, dati: [] };
      const cols = res[0].columns;
      const rows = res[0].values.map(row => {
        const obj = {};
        cols.forEach((c, i) => obj[c] = row[i]);
        return obj;
      });
      return { successo: true, dati: rows };
    } catch (err) {
      console.error('❌ Errore lista analisi:', err.message);
      return { successo: false, errore: err.message };
    }
  });

  // ── GET SINGOLA ANALISI ──────────────────────────────────────────────────

  ipcMain.handle('get-analisi', async (event, analisi_id) => {
    try {
      const db = getDb();
      const res = db.exec(`SELECT * FROM audit_analisi WHERE analisi_id = '${analisi_id}' LIMIT 1`);
      if (res.length === 0 || res[0].values.length === 0)
        return { successo: false, errore: 'Analisi non trovata' };
      const cols = res[0].columns;
      const obj  = {};
      cols.forEach((c, i) => obj[c] = res[0].values[0][i]);
      return { successo: true, dati: obj };
    } catch (err) {
      return { successo: false, errore: err.message };
    }
  });

  // ── GENERA REPORT PDF ────────────────────────────────────────────────────

  ipcMain.handle('genera-report', async (event, datiAnalisi) => {
    try {
      const { buffer, fileName } = await genera_pdf_buffer(datiAnalisi);

      const { filePath } = await dialog.showSaveDialog({
        defaultPath: path.join(app.getPath('documents'), fileName),
        filters: [{ name: 'PDF', extensions: ['pdf'] }]
      });

      if (!filePath) return { successo: false, errore: 'Salvataggio annullato' };

      fs.writeFileSync(filePath, buffer);

      // Salva hash PDF in audit
      const hash_pdf = crypto.createHash('sha256').update(buffer).digest('hex');
      try {
        const db = getDb();
        db.run(
          `UPDATE audit_analisi SET hash_report = '${hash_pdf}' WHERE analisi_id = '${datiAnalisi.contratto_id}'`
        );
      } catch (_) {}

      console.log('✅ PDF salvato:', filePath);
      return { successo: true, path_file: filePath, hash_pdf };
    } catch (err) {
      console.error('❌ Errore genera report:', err.message);
      return { successo: false, errore: err.message };
    }
  });

  // ── EXPORT CSV ───────────────────────────────────────────────────────────

  ipcMain.handle('export-csv', async (event, filtri = {}) => {
    try {
      const db = getDb();
      const res = db.exec("SELECT * FROM audit_analisi ORDER BY timestamp_analisi DESC");
      if (res.length === 0) return { successo: false, errore: 'Nessun dato da esportare' };

      const cols = res[0].columns;
      const rows = res[0].values;
      const csv  = [cols.join(';')]
        .concat(rows.map(r => r.map(v => (v === null ? '' : String(v).replace(/;/g, ','))).join(';')))
        .join('\r\n');

      const { filePath } = await dialog.showSaveDialog({
        defaultPath: path.join(app.getPath('documents'), `BBRE_Export_${Date.now()}.csv`),
        filters: [{ name: 'CSV', extensions: ['csv'] }]
      });

      if (!filePath) return { successo: false, errore: 'Esportazione annullata' };

      fs.writeFileSync(filePath, '\uFEFF' + csv, 'utf8'); // BOM per Excel italiano
      return { successo: true, path_file: filePath };
    } catch (err) {
      return { successo: false, errore: err.message };
    }
  });

  // ── EXPORT PIANO ANATOCISMO CSV ──────────────────────────────────────────

  ipcMain.handle('export-piano-anatocismo', async (event, { piano_rate, contratto_id }) => {
    try {
      if (!piano_rate || piano_rate.length === 0) {
        return { successo: false, errore: 'Piano rate vuoto' };
      }

      const cols = ['n', 'data_scadenza', 'rata', 'quota_interessi', 'quota_capitale',
                    'debito_residuo_inizio', 'debito_residuo_fine'];
      const header = cols.join(';');
      const rows   = piano_rate.map(r =>
        cols.map(c => r[c] != null ? String(r[c]).replace(/;/g, ',') : '').join(';')
      );
      const csv = '\uFEFF' + [header, ...rows].join('\r\n');

      const safeId   = (contratto_id || 'Piano').replace(/[^a-zA-Z0-9]/g, '_');
      const fileName = `BBRE_PianoRate_${safeId}_${Date.now()}.csv`;

      const { filePath } = await dialog.showSaveDialog({
        defaultPath: path.join(app.getPath('documents'), fileName),
        filters: [{ name: 'CSV', extensions: ['csv'] }]
      });

      if (!filePath) return { successo: false, errore: 'Esportazione annullata' };
      fs.writeFileSync(filePath, csv, 'utf8');
      console.log('✅ Piano rate salvato:', filePath);
      return { successo: true, path_file: filePath };
    } catch (err) {
      console.error('❌ Errore export piano:', err.message);
      return { successo: false, errore: err.message };
    }
  });

  // ── BACKUP DB ────────────────────────────────────────────────────────────

  ipcMain.handle('backup-db', async () => {
    try {
      const db = getDb();
      const data = db.export(); // sql.js -> Uint8Array
      const buffer = Buffer.from(data);

      const { filePath } = await dialog.showSaveDialog({
        defaultPath: path.join(app.getPath('documents'), `BBRE_Backup_${Date.now()}.sqlite`),
        filters: [{ name: 'SQLite', extensions: ['sqlite'] }]
      });

      if (!filePath) return { successo: false, errore: 'Backup annullato' };

      fs.writeFileSync(filePath, buffer);
      console.log('✅ Backup DB salvato:', filePath);
      return { successo: true, path_file: filePath };
    } catch (err) {
      return { successo: false, errore: err.message };
    }
  });

  // ── GET CONFIG ───────────────────────────────────────────────────────────

  ipcMain.handle('get-config', async () => {
    try {
      const db = getDb();
      const res = db.exec("SELECT chiave, valore FROM config_app");
      if (res.length === 0) return { successo: true, dati: {} };
      const config = {};
      res[0].values.forEach(([k, v]) => config[k] = v);
      return { successo: true, dati: config };
    } catch (err) {
      return { successo: false, errore: err.message };
    }
  });

  // ── AGGIORNAMENTO SOGLIE ─────────────────────────────────────────────────

  ipcMain.handle('controlla-aggiornamenti-soglie', async () => {
    try {
      const { controlla_e_aggiorna_soglie } = require('../db/soglie_updater');
      const db = getDb();
      const result = await controlla_e_aggiorna_soglie(db);
      return { successo: true, dati: result };
    } catch (err) {
      return { successo: false, errore: err.message };
    }
  });

  console.log('✅ IPC Handlers registrati (9 canali)');
}

module.exports = { setupIpcHandlers };