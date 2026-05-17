# BBRE Anomalie Bancarie — Guida al Build

## Prerequisiti

- **Node.js** 18+ (LTS consigliato)
- **npm** 9+
- **Windows** 10/11 x64 (per build Windows)
- Connessione internet (per scaricare electron binaries)

## Setup iniziale

```bash
# Clona il repo
git clone https://github.com/Beppe225/BBRE-Anomalie-Bancarie.git
cd BBRE-Anomalie-Bancarie

# Installa dipendenze
npm install
```

## Avvio in modalità sviluppo

```bash
npm start
```

## Build Windows

### Installer NSIS (.exe) + Portable

```bash
npm run build:win
```

Output in `dist/`:
- `BBRE-Anomalie-Bancarie-1.2.0-Setup.exe` — Installer (con schermate, desktop shortcut)
- `BBRE-Anomalie-Bancarie-1.2.0-Portable.exe` — Versione portable (no install)
- `latest.yml` — Manifest per auto-updater

### Publish su GitHub Releases (auto-updater)

```bash
# Richiede variabile d'ambiente GH_TOKEN con scope repo
set GH_TOKEN=github_pat_...
npm run publish:win
```

Questo crea automaticamente una GitHub Release con i file `.exe` e il manifest `latest.yml`.

## Struttura dist/ dopo il build

```
dist/
├── BBRE-Anomalie-Bancarie-1.2.0-Setup.exe     ← Installer Windows
├── BBRE-Anomalie-Bancarie-1.2.0-Portable.exe  ← Portable Windows
├── latest.yml                                   ← Manifest auto-updater
└── win-unpacked/                                ← App unpacked (debug)
```

## Assets richiesti

Prima del build, assicurati che esistano:
```
assets/
├── icon.ico   ← Icona Windows (256x256 min)
├── icon.png   ← Icona macOS/Linux (512x512)
```

Se non presenti, il build usa l'icona default di Electron.

## Auto-updater

L'app controlla aggiornamenti automaticamente all'avvio (solo in produzione, non in `npm start`).

Flusso:
1. Avvio → controlla `https://github.com/Beppe225/BBRE-Anomalie-Bancarie/releases/latest.yml`
2. Se versione > installata → dialog conferma download
3. Download in background → progress bar nel titolo finestra
4. Download completo → dialog riavvio

Per rilasciare una nuova versione:
1. Aggiorna `"version"` in `package.json`
2. Aggiorna versione in `src/renderer/index.html`
3. `npm run publish:win` (con GH_TOKEN)

## Note di sicurezza

- Le API key LLM sono salvate nel DB locale, mai esposte al renderer
- Context isolation attiva (`contextIsolation: true`, `nodeIntegration: false`)
- Whitelist IPC: solo i canali autorizzati in `preload.js` sono accessibili
- Il DB sqlite viene salvato in `data/bbre.db` nella cartella app

## Troubleshooting

**Errore "sql.js WASM non trovato"**
→ Verificare che `node_modules/sql.js/dist/` esista. Rieseguire `npm install`.

**Build fallisce su "electron-builder install-app-deps"**
→ `npm install --ignore-scripts && npm run postinstall`

**Auto-updater non funziona in sviluppo**
→ Normale. L'updater è attivo solo quando `app.isPackaged === true`.
