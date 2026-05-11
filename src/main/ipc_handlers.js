const { ipcMain, shell, dialog, app } = require('electron');
const { esegui_analisi } = require('../engine/orchestrator');
const { genera_pdf_buffer } = require('../reports/pdf_generator');
const { getMarketData } = require('../market/fetcher');
const path = require('path');
const fs = require('fs');

function setupIpcHandlers() {
  console.log('🔌 Configurazione IPC Handlers...');

  // Handler Analisi
  ipcMain.handle('esegui-analisi', async (event, payload) => {
    try {
      if (!global.dbManager) throw new Error("Database non pronto");
      const risultato = await esegui_analisi(global.dbManager.getDb(), payload);
      return { successo: true, dati: risultato };
    } catch (err) {
      return { successo: false, errore: err.message };
    }
  });

  // Handler PDF con Dialog
  ipcMain.handle('salva-pdf-dialog', async (event, datiAnalisi) => {
    try {
      const { buffer, fileName } = await genera_pdf_buffer(datiAnalisi);
      const { filePath, canceled } = await dialog.showSaveDialog({
        title: 'Salva Report BBRE',
        defaultPath: fileName,
        filters: [
          { name: 'PDF Files', extensions: ['pdf'] },
          { name: 'All Files', extensions: ['*'] }
        ]
      });
      if (!canceled && filePath) {
        fs.writeFileSync(filePath, buffer);
        console.log(`✅ PDF salvato in: ${filePath}`);
        return { successo: true, path: filePath };
      }
      return { successo: false, messaggio: 'Annullato' };
    } catch (err) {
      return { successo: false, errore: err.message };
    }
  });

  // Handler Mercato
  ipcMain.handle('get-market-data', async () => {
    try {
      const dati = await getMarketData();
      return { successo: true, dati: dati };
    } catch (err) {
      return { successo: false, errore: err.message };
    }
  });

  // Handler Archivio - Lista Analisi
  ipcMain.handle('get-analisi-list', async () => {
    try {
      const db = global.dbManager.getDb();
      const stmt = db.prepare(`
        SELECT analisi_id, timestamp_analisi, score, hash_catena, teg, soglia
        FROM audit_analisi 
        ORDER BY timestamp_analisi DESC 
        LIMIT 50
      `);
      const rows = stmt.all();
      return { successo: true, dati: rows };
    } catch (err) {
      return { successo: false, errore: err.message };
    }
  });

  // Handler Archivio - Elimina
  ipcMain.handle('delete-analisi', async (event, analisiId) => {
    try {
      const db = global.dbManager.getDb();
      const stmt = db.prepare('DELETE FROM audit_analisi WHERE analisi_id = ?');
      stmt.run(analisiId);
      return { successo: true };
    } catch (err) {
      return { successo: false, errore: err.message };
    }
  });

  // Handler Impostazioni - Info Sistema
  ipcMain.handle('get-system-info', async () => {
    try {
      const db = global.dbManager.getDb();
      const config = db.prepare('SELECT * FROM config_app').all();
      const dbPath = global.dbManager ? global.dbManager.dbPath : 'N/D';
      
      return {
        successo: true,
        appVersion: app.getVersion(),
        dbPath: dbPath,
        config: config.reduce((acc, curr) => { 
          acc[curr.chiave] = curr.valore; 
          return acc; 
        }, {})
      };
    } catch (err) {
      return { successo: false, errore: err.message };
    }
  });

  // Handler Backup Database
  ipcMain.handle('backup-db', async () => {
    try {
      const { filePath, canceled } = await dialog.showSaveDialog({
        title: 'Salva Backup Database',
        defaultPath: `bbre_backup_${Date.now()}.db`,
        filters: [{ name: 'SQLite Database', extensions: ['db'] }]
      });
      
      if (!canceled && filePath) {
        const dbPath = global.dbManager.dbPath;
        fs.copyFileSync(dbPath, filePath);
        console.log(`✅ Backup creato: ${filePath}`);
        return { successo: true, path: filePath };
      }
      return { successo: false, messaggio: 'Annullato' };
    } catch (err) {
      return { successo: false, errore: err.message };
    }
  });
}

module.exports = { setupIpcHandlers };
