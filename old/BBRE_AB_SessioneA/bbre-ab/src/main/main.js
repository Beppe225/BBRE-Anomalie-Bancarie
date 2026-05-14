/**
 * BBRE Anomalie Bancarie — Main process
 * Electron bootstrap.
 * Sicurezza: nodeIntegration: false, contextIsolation: true, no Express.
 *
 * All'avvio chiama controlla_e_aggiorna_soglie() in background (asincrono,
 * non blocca mai la UI).
 */

'use strict';

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

const { closeDb, getDb }              = require('../db/db');
const { registerHandlers }            = require('./ipc_handlers');
const { controlla_e_aggiorna_soglie } = require('../db/soglie_updater');

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280, height: 800, minWidth: 900, minHeight: 600,
    backgroundColor: '#111111',
    title: 'BBRE Anomalie Bancarie',
    webPreferences: {
      preload:          path.join(__dirname, '..', 'preload', 'preload.js'),
      nodeIntegration:  false,
      contextIsolation: true,
      sandbox:          false,
      devTools:         !app.isPackaged
    }
  });
  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  mainWindow.on('closed', () => { mainWindow = null; });
}

async function avviaAggiornamentoSoglie() {
  try {
    const db = getDb();
    const risultato = await controlla_e_aggiorna_soglie(db);
    if (risultato.errore) {
      console.log(`[Avvio] Aggiornamento soglie: ${risultato.errore} (non bloccante)`);
      return;
    }
    if (risultato.aggiornato && risultato.nuove_righe > 0) {
      console.log(`[Avvio] Soglie aggiornate: ${risultato.nuove_righe} nuovi trimestri da Banca d'Italia`);
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('soglie-aggiornate', {
          nuove_righe:      risultato.nuove_righe,
          versione_attuale: risultato.versione_attuale
        });
      }
    } else {
      console.log(`[Avvio] Soglie già aggiornate (v: ${risultato.versione_attuale || 'seed'})`);
    }
  } catch (err) {
    console.log(`[Avvio] Errore non bloccante soglie: ${err.message}`);
  }
}

app.whenReady().then(() => {
  registerHandlers(ipcMain);
  createWindow();
  avviaAggiornamentoSoglie(); // fire-and-forget, NON blocca l'avvio
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => { closeDb(); if (process.platform !== 'darwin') app.quit(); });
app.on('before-quit', () => closeDb());
