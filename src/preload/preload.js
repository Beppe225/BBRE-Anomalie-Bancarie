const { contextBridge, ipcRenderer } = require('electron');

// Canali IPC autorizzati (whitelist sicurezza)
const CANALI_VALIDI = [
  'esegui-analisi', 'lista-analisi', 'get-analisi',
  'genera-report', 'export-csv', 'export-piano-anatocismo',
  'backup-db', 'get-config', 'controlla-aggiornamenti-soglie',
  // Sessione E — Parser LLM
  'carica-documento', 'apri-dialog-file', 'salva-config-llm', 'get-config-llm',
  'elimina-analisi', 'get-market-data', 'get-app-version', 'controlla-aggiornamenti-manuali',
  // Sessione G — Export Excel
  'export-excel'
];

contextBridge.exposeInMainWorld('electronAPI', {
  // Invocazione generica (retrocompatibilità)
  invoke: (channel, ...args) => {
    if (!CANALI_VALIDI.includes(channel)) {
      return Promise.reject(new Error(`Canale IPC non autorizzato: ${channel}`));
    }
    return ipcRenderer.invoke(channel, ...args);
  },

  send: (channel, ...args) => ipcRenderer.send(channel, ...args),
  on:   (channel, func) => {
    ipcRenderer.on(channel, (event, ...args) => func(...args));
  },

  // ── API Named Sessione E ─────────────────────────────────────────────────
  // Apre dialog nativo di selezione file e restituisce il path scelto
  apriDialogFile: () => ipcRenderer.invoke('apri-dialog-file'),

  // Carica e analizza il documento con LLM (path passato dal dialog)
  caricaDocumento: (filePath) => ipcRenderer.invoke('carica-documento', filePath),

  // Salva configurazione LLM nelle Impostazioni
  salvaConfigLLM: (cfg) => ipcRenderer.invoke('salva-config-llm', cfg),

  // Legge provider LLM e se la key è presente (NON la key stessa)
  getConfigLLM: () => ipcRenderer.invoke('get-config-llm', 'elimina-analisi', 'get-market-data', 'get-app-version', 'controlla-aggiornamenti-manuali')
});

