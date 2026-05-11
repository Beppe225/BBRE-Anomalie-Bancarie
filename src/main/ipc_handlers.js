const { ipcMain } = require('electron');
const { esegui_analisi } = require('../engine/orchestrator');

function setupIpcHandlers() {
  console.log('🔌 Configurazione IPC Handlers...');

  ipcMain.handle('esegui-analisi', async (event, payload) => {
    console.log('📥 Ricevuta richiesta analisi:', payload.contratto_id);
    
    try {
      // Verifica che global.dbManager esista
      if (!global.dbManager) {
        console.error('❌ global.dbManager è null!');
        throw new Error('Database non inizializzato. Riavvia l\'app.');
      }
      
      const db = global.dbManager.getDb();
      
      // Verifica che db non sia null
      if (!db) {
        console.error('❌ db.getDb() ha restituito null!');
        throw new Error('Database non disponibile.');
      }
      
      console.log('✅ Database valido, avvio analisi...');
      const risultato = await esegui_analisi(db, payload);
      
      console.log('✅ Analisi completata con successo');
      return { successo: true, dati: risultato };
    } catch (err) {
      console.error('❌ Errore Analisi:', err);
      console.error('Stack:', err.stack);
      return { successo: false, errore: err.message };
    }
  });
}

module.exports = { setupIpcHandlers };
