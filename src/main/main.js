const { app, BrowserWindow } = require('electron');
const path = require('path');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      contextIsolation: true,    // ✅ FASE 0: Sicurezza
      nodeIntegration: false,     // ✅ FASE 0: Sicurezza
      preload: path.join(__dirname, '../preload/preload.js')
    }
  });

  mainWindow.loadFile('src/renderer/index.html');
  
  // Uncomment per debug:
  // mainWindow.webContents.openDevTools();
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
