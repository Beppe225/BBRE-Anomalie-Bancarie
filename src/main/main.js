const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const DatabaseManager = require('../db/db');
const { seedSoglieUsura } = require('../db/seed_soglie');
const { seedRegoleNormative } = require('../db/seed_regole');
const { setupIpcHandlers } = require('./ipc_handlers');

global.dbManager = null;
let mainWindow;

async function initDatabase() {
  try {
    console.log('🗄️  Inizializzazione database...');
    const dbPath = path.join(__dirname, '../../data/bbre.db');
    
    // Crea cartella data se non esiste
    const dataDir = path.dirname(dbPath);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
      console.log('📁 Cartella data creata:', dataDir);
    }
    
    global.dbManager = new DatabaseManager(dbPath);
    await global.dbManager.init();
    
    const db = global.dbManager.getDb();
    
    if (!db) {
      throw new Error('Database non inizializzato correttamente');
    }
    
    // STEP 1: Esegui schema SQL se le tabelle non esistono
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
    
    // STEP 2: Seed iniziali se DB vuoto
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
    console.error('Stack:', err.stack);
    return false;
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
  const dbOk = await initDatabase();
  
  if (!dbOk) {
    console.error('❌ Impossibile avviare l\'app senza database');
    app.quit();
    return;
  }
  
  setupIpcHandlers();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (global.dbManager) {
    console.log('💾 Salvataggio database...');
    try {
      global.dbManager.close();
    } catch (err) {
      console.error('Errore chiusura DB:', err);
    }
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
