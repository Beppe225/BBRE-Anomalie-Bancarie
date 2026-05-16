const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs   = require('fs');
const DatabaseManager    = require('../db/db');
const { seedSoglieUsura }    = require('../db/seed_soglie');
const { seedRegoleNormative } = require('../db/seed_regole');
const { setupIpcHandlers }   = require('./ipc_handlers');

// ── Auto-updater (solo in produzione, non durante npm start) ──────────────────
let autoUpdater = null;
if (app.isPackaged) {
  try {
    autoUpdater = require('electron-updater').autoUpdater;
    autoUpdater.autoDownload    = false; // chiede conferma prima di scaricare
    autoUpdater.autoInstallOnAppQuit = true;
    console.log('✅ Auto-updater caricato');
  } catch (err) {
    console.warn('⚠️  Auto-updater non disponibile:', err.message);
  }
}

global.dbManager = null;
let mainWindow;

// ── Database ──────────────────────────────────────────────────────────────────
async function initDatabase() {
  try {
    console.log('🗄️  Inizializzazione database...');
    const dbPath = path.join(__dirname, '../../data/bbre.db');

    const dataDir = path.dirname(dbPath);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
      console.log('📁 Cartella data creata:', dataDir);
    }

    global.dbManager = new DatabaseManager(dbPath);
    await global.dbManager.init();

    const db = global.dbManager.getDb();
    if (!db) throw new Error('Database non inizializzato correttamente');

    // Schema
    console.log('📋 Verifica/creazione schema...');
    const tableCheck = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='soglie_usura'");
    if (tableCheck.length === 0 || tableCheck[0].values.length === 0) {
      console.log('📝 Creazione schema database...');
      const schemaPath = path.join(__dirname, '../db/schema.sql');
      const schema = fs.readFileSync(schemaPath, 'utf8');
      db.run(schema);
      global.dbManager.save();
      console.log('✅ Schema database creato');
    } else {
      console.log('✅ Schema già esistente');
    }

    // Seed
    const checkSoglie = db.exec("SELECT COUNT(*) FROM soglie_usura");
    const count = checkSoglie[0].values[0][0];
    if (count === 0) {
      console.log('📝 Esecuzione seed iniziali...');
      seedSoglieUsura(db);
      seedRegoleNormative(db);
      global.dbManager.save();
      console.log('✅ Seed completati');
    } else {
      console.log(`✅ Database popolato (${count} soglie presenti)`);
    }

    console.log('✅ Database pronto:', dbPath);
    return true;
  } catch (err) {
    console.error('❌ Errore database:', err);
    return false;
  }
}

// ── Finestra principale ───────────────────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width:  1200,
    height: 800,
    icon: path.join(__dirname, '../../assets/icon.png'),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration:  false,
      preload: path.join(__dirname, '../preload/preload.js')
    }
  });

  mainWindow.loadFile('src/renderer/index.html');
  console.log('✅ UI caricata');
}

// ── Auto-updater: logica notifiche ────────────────────────────────────────────
function setupAutoUpdater() {
  if (!autoUpdater || !mainWindow) return;

  // Aggiornamento disponibile → chiedi conferma
  autoUpdater.on('update-available', (info) => {
    console.log('🔄 Aggiornamento disponibile:', info.version);
    dialog.showMessageBox(mainWindow, {
      type:    'info',
      title:   'Aggiornamento disponibile',
      message: `BBRE v${info.version} è disponibile.\nVuoi scaricarlo ora?`,
      detail:  `Versione attuale: ${app.getVersion()}\nNuova versione: ${info.version}`,
      buttons: ['Scarica e installa', 'Più tardi'],
      defaultId: 0,
      cancelId:  1
    }).then(({ response }) => {
      if (response === 0) {
        autoUpdater.downloadUpdate();
        // Mostra progresso nel titolo finestra
        mainWindow.setTitle('BBRE — Download aggiornamento...');
      }
    });
  });

  // Nessun aggiornamento
  autoUpdater.on('update-not-available', () => {
    console.log('✅ App aggiornata');
  });

  // Progresso download
  autoUpdater.on('download-progress', (progress) => {
    const pct = Math.round(progress.percent);
    mainWindow?.setTitle(`BBRE — Download ${pct}%`);
    mainWindow?.setProgressBar(pct / 100);
    console.log(`⬇️  Download: ${pct}%`);
  });

  // Download completato → chiedi riavvio
  autoUpdater.on('update-downloaded', (info) => {
    mainWindow?.setTitle('BBRE Anomalie Bancarie');
    mainWindow?.setProgressBar(-1);
    console.log('✅ Aggiornamento scaricato:', info.version);

    dialog.showMessageBox(mainWindow, {
      type:    'info',
      title:   'Aggiornamento pronto',
      message: `BBRE v${info.version} è pronto.\nRiavvia per installarlo.`,
      buttons: ['Riavvia ora', 'Dopo'],
      defaultId: 0,
      cancelId:  1
    }).then(({ response }) => {
      if (response === 0) autoUpdater.quitAndInstall();
    });
  });

  // Errore updater (non bloccante)
  autoUpdater.on('error', (err) => {
    console.warn('⚠️  Auto-updater errore:', err.message);
    mainWindow?.setTitle('BBRE Anomalie Bancarie');
    mainWindow?.setProgressBar(-1);
  });

  // Controlla aggiornamenti 3 secondi dopo l'avvio (dà tempo al DB di inizializzare)
  setTimeout(() => {
    console.log('🔍 Controllo aggiornamenti...');
    autoUpdater.checkForUpdates().catch(err => {
      console.warn('⚠️  Check update fallito:', err.message);
    });
  }, 3000);

  // Ricontrolla ogni 6 ore
  setInterval(() => {
    autoUpdater.checkForUpdates().catch(() => {});
  }, 6 * 60 * 60 * 1000);
}

// ── Handler IPC per controllo manuale aggiornamenti ───────────────────────────
function setupUpdaterIpc() {
  ipcMain.handle('controlla-aggiornamenti-manuali', async () => {
    if (!autoUpdater) {
      return { successo: false, errore: 'Auto-updater non disponibile (modalità sviluppo)' };
    }
    try {
      const result = await autoUpdater.checkForUpdates();
      return { successo: true, versione: result?.updateInfo?.version || null };
    } catch (err) {
      return { successo: false, errore: err.message };
    }
  });

  ipcMain.handle('get-app-version', () => {
    return { versione: app.getVersion(), isPackaged: app.isPackaged };
  });
}

// ── Avvio app ─────────────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  const dbOk = await initDatabase();

  if (!dbOk) {
    console.error('❌ Impossibile avviare l\'app senza database');
    app.quit();
    return;
  }

  setupIpcHandlers();
  setupUpdaterIpc();
  createWindow();
  setupAutoUpdater(); // avvia dopo createWindow (serve mainWindow)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (global.dbManager) {
    console.log('💾 Salvataggio database...');
    try { global.dbManager.close(); } catch (_) {}
  }
  if (process.platform !== 'darwin') app.quit();
});
