const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const DatabaseManager = require('../db/db');
const { setupIpcHandlers } = require('./ipc_handlers');
const { autoUpdater } = require('electron-updater');

global.dbManager = null;
let mainWindow;

// --- Configurazione Auto-Updater ---
autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;

autoUpdater.on('checking-for-update', () => {
  console.log('🔄 Controllo aggiornamenti in corso...');
});

autoUpdater.on('update-available', (info) => {
  console.log('✅ Aggiornamento disponibile:', info.version);
  dialog.showMessageBox({
    type: 'info',
    title: 'Aggiornamento Disponibile',
    message: `Nuova versione ${info.version} disponibile. Vuoi scaricarla ora?`,
    buttons: ['Sì, scarica', 'No']
  }).then(result => {
    if (result.response === 0) {
      autoUpdater.downloadUpdate();
    }
  });
});

autoUpdater.on('update-not-available', () => {
  console.log('ℹ️ L\'app è aggiornata.');
});

autoUpdater.on('update-downloaded', (info) => {
  dialog.showMessageBox({
    type: 'info',
    title: 'Installazione Aggiornamento',
    message: 'Aggiornamento scaricato. Riavviare l\'app per installare?',
    buttons: ['Riavvia Ora', 'Dopo']
  }).then(result => {
    if (result.response === 0) {
      setImmediate(() => autoUpdater.quitAndInstall());
    }
  });
});

async function initDatabase() {
  try {
    console.log('🗄️  Inizializzazione database...');
    const dbPath = path.join(__dirname, '../../data/bbre.db');
    global.dbManager = new DatabaseManager(dbPath);
    await global.dbManager.init();
    console.log('✅ Database pronto');
  } catch (err) {
    console.error('❌ Errore database:', err);
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200, 
    height: 800,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, '../preload/preload.js')
    }
  });
  
  mainWindow.loadFile('src/renderer/index.html');
  console.log('✅ UI caricata');
}

app.whenReady().then(async () => {
  await initDatabase();
  setupIpcHandlers();
  createWindow();

  // Avvia controllo aggiornamenti dopo 3 secondi
  setTimeout(() => {
    try {
      autoUpdater.checkForUpdatesAndNotify();
  // Debug: log configurazione update
  const { app } = require('electron');
  console.log('🔍 Update config:', {
    isPackaged: app.isPackaged,
    userData: app.getPath('userData'),
    exePath: app.getPath('exe'),
    publishUrl: require('electron-updater').autoUpdater.currentVersion?.raw
  });
    } catch (e) {
      console.warn('⚠️ Auto-update non configurato o offline:', e.message);
    }
  }, 3000);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (global.dbManager) {
    console.log('💾 Salvataggio database...');
    global.dbManager.close();
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

