/**
 * BBRE Anomalie Bancarie — Preload script
 * Context bridge sicuro tra renderer e main process
 * nodeIntegration: false | contextIsolation: true
 */

'use strict';

const { contextBridge, ipcRenderer } = require('electron');

// Helper: sanitizza stringhe in input prima di passarle al main
function sanitize(val) {
  if (typeof val === 'string') return val.trim().substring(0, 10000);
  if (typeof val === 'number') return Number.isFinite(val) ? val : null;
  if (typeof val === 'boolean') return val;
  if (val === null || val === undefined) return null;
  if (typeof val === 'object') {
    // Serializza e deserializza per rimuovere prototipi pericolosi
    return JSON.parse(JSON.stringify(val));
  }
  return null;
}

function sanitizeObj(obj) {
  if (!obj || typeof obj !== 'object') return {};
  const clean = {};
  for (const [k, v] of Object.entries(obj)) {
    clean[sanitize(k)] = sanitize(v);
  }
  return clean;
}

// API esposta al renderer — SOLO le funzioni necessarie
contextBridge.exposeInMainWorld('bbreAPI', {

  // ── CONTRATTI ─────────────────────────────────────────────────
  contratti: {
    list:   ()        => ipcRenderer.invoke('contratti:list'),
    get:    (id)      => ipcRenderer.invoke('contratti:get',    Number(id)),
    create: (data)    => ipcRenderer.invoke('contratti:create', sanitizeObj(data)),
    update: (id, data)=> ipcRenderer.invoke('contratti:update', Number(id), sanitizeObj(data)),
    delete: (id)      => ipcRenderer.invoke('contratti:delete', Number(id)),
  },

  // ── VOCI COSTO ────────────────────────────────────────────────
  vociCosto: {
    listByContratto: (cId) => ipcRenderer.invoke('voci:listByContratto', Number(cId)),
    create: (data)         => ipcRenderer.invoke('voci:create', sanitizeObj(data)),
    update: (id, data)     => ipcRenderer.invoke('voci:update', Number(id), sanitizeObj(data)),
    delete: (id)           => ipcRenderer.invoke('voci:delete', Number(id)),
  },

  // ── SOGLIE USURA ──────────────────────────────────────────────
  soglie: {
    find: (categoria, data) => ipcRenderer.invoke('soglie:find',
                                sanitize(categoria), sanitize(data)),
    list: (filters)         => ipcRenderer.invoke('soglie:list', sanitizeObj(filters)),
  },

  // ── REGOLE NORMATIVE ──────────────────────────────────────────
  regole: {
    list:      (tipo) => ipcRenderer.invoke('regole:list', sanitize(tipo)),
    getByCode: (cod)  => ipcRenderer.invoke('regole:getByCode', sanitize(cod)),
  },

  // ── ANALISI ───────────────────────────────────────────────────
  analisi: {
    run:    (contrattoId) => ipcRenderer.invoke('analisi:run', Number(contrattoId)),
    list:   (filters)     => ipcRenderer.invoke('analisi:list', sanitizeObj(filters)),
    get:    (id)          => ipcRenderer.invoke('analisi:get', Number(id)),
    delete: (id)          => ipcRenderer.invoke('analisi:delete', Number(id)),
  },

  // ── REPORT ────────────────────────────────────────────────────
  report: {
    generate: (analisiId) => ipcRenderer.invoke('report:generate', Number(analisiId)),
    list:     (analisiId) => ipcRenderer.invoke('report:list', Number(analisiId)),
    open:     (path)      => ipcRenderer.invoke('report:open', sanitize(path)),
  },

  // ── CONFIG / AGGIORNAMENTO SOGLIE ─────────────────────────────
  config: {
    get:                    ()  => ipcRenderer.invoke('get_config'),
    controllaAggiornamenti: ()  => ipcRenderer.invoke('controlla_aggiornamenti_soglie'),
  },

  // ── UTILITY ───────────────────────────────────────────────────
  app: {
    getVersion:  ()  => ipcRenderer.invoke('app:getVersion'),
    openExternal:(url) => ipcRenderer.invoke('app:openExternal', sanitize(url)),
  },

  // ── EVENTI PUSH (main → renderer) ────────────────────────────
  // Notifica discreta quando soglie vengono aggiornate in background
  onSoglieAggiornate: (callback) => {
    ipcRenderer.on('soglie-aggiornate', (_, data) => callback(data));
  }
});
