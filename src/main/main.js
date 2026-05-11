const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const DatabaseManager = require('../db/db');
const { seedSoglieUsura } = require('../db/seed_soglie');
const { seedRegoleNormative } = require('../db/seed_regole');
const { esegui_analisi } = require('../engine/orchestrator');
const { setupIpcHandlers } = require('./ipc_handlers');

global.dbManager = null;
let mainWindow;

async function initDatabase() {
  try {
    console.log('🗄️  Inizializzazione database...');
    const dbPath = path.join(__dirname, '../../data/bbre.db');
    global.dbManager = new DatabaseManager(dbPath);
    await global.dbManager.init();
    
    const db = global.dbManager.getDb();
    const checkSoglie = db.exec("SELECT COUNT(*) FROM soglie_usura");
    
    if (checkSoglie[0].values[0][0] === 0) {
      console.log('📝 Esecuzione seed iniziali...');
      seedSoglieUsura(db);
      seedRegoleNormative(db);
      global.dbManager.save();
    }
    
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

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (global.dbManager) {
    console.log('💾 Salvataggio database...');
    global.dbManager.close();
  }
  if (process.platform !== 'darwin') app.quit();
});
