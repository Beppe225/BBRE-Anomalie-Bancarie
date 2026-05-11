const { ipcMain } = require('electron');
const { esegui_analisi } = require('../engine/orchestrator');

function setupIpcHandlers() {
  console.log('🔌 Configurazione IPC Handlers...');

  ipcMain.handle('esegui-analisi', async (event, payload) => {
    try {
      console.log(' Ricevuta richiesta analisi:', payload.contratto_id);
      if (!global.dbManager) throw new Error("Database non pronto");
      
      const risultato = await esegui_analisi(global.dbManager.getDb(), payload);
      return { successo: true, dati: risultato };
    } catch (err) {
      console.error('❌ Errore Analisi:', err);
      return { successo: false, errore: err.message };
    }
  });
}

module.exports = { setupIpcHandlers };
