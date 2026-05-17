@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul 2>&1
title BBRE — Build e Publish v1.2.0

:: ============================================================
::  BBRE Anomalie Bancarie — Script Build + Publish Windows
::  Versione: 1.2.0
::  Uso: doppio clic oppure esegui da terminale nella cartella
::       del progetto (dove si trova package.json)
:: ============================================================

echo.
echo  ██████╗ ██████╗ ██████╗ ███████╗
echo  ██╔══██╗██╔══██╗██╔══██╗██╔════╝
echo  ██████╔╝██████╔╝██████╔╝█████╗
echo  ██╔══██╗██╔══██╗██╔══██╗██╔══╝
echo  ██████╔╝██████╔╝██║  ██║███████╗
echo  ╚═════╝ ╚═════╝ ╚═╝  ╚═╝╚══════╝
echo.
echo  Anomalie Bancarie — Build ^& Publish v1.2.0
echo  ============================================
echo.

:: ── STEP 0: Verifica cartella corretta ─────────────────────
if not exist "package.json" (
    echo  [ERRORE] package.json non trovato.
    echo  Sposta questo file nella cartella del progetto
    echo  (la stessa cartella dove si trova package.json^)
    echo.
    pause
    exit /b 1
)

:: Leggi versione da package.json (semplice grep)
for /f "tokens=2 delims=:," %%v in ('findstr /i "\"version\"" package.json') do (
    set RAW_VERSION=%%v
)
:: Rimuovi spazi e virgolette
set APP_VERSION=%RAW_VERSION: =%
set APP_VERSION=%APP_VERSION:"=%
echo  Versione rilevata: %APP_VERSION%
echo.

:: ── STEP 1: Verifica Node.js ────────────────────────────────
echo  [1/7] Verifica Node.js...
node --version >nul 2>&1
if errorlevel 1 (
    echo  [ERRORE] Node.js non trovato.
    echo  Scarica da: https://nodejs.org (versione LTS^)
    echo.
    pause
    exit /b 1
)
for /f %%v in ('node --version') do set NODE_VER=%%v
echo         Node.js %NODE_VER% trovato ✓

npm --version >nul 2>&1
if errorlevel 1 (
    echo  [ERRORE] npm non trovato. Reinstalla Node.js.
    pause
    exit /b 1
)
for /f %%v in ('npm --version') do set NPM_VER=%%v
echo         npm %NPM_VER% trovato ✓
echo.

:: ── STEP 2: GH_TOKEN ───────────────────────────────────────
echo  [2/7] Verifica GitHub Token (GH_TOKEN)...
if "%GH_TOKEN%"=="" (
    echo.
    echo  GH_TOKEN non impostato come variabile d'ambiente.
    echo  Inseriscilo ora (oppure premi INVIO per build locale senza publish^):
    echo.
    set /p GH_TOKEN="  GH_TOKEN = "
    echo.
)

if "%GH_TOKEN%"=="" (
    echo  [AVVISO] Nessun token — verranno creati solo i file .exe locali
    echo           senza pubblicare su GitHub Releases.
    set PUBLISH_FLAG=never
) else (
    echo         Token presente ✓
    set PUBLISH_FLAG=always
)
echo.

:: ── STEP 3: Sync git ───────────────────────────────────────
echo  [3/7] Aggiornamento codice da GitHub...
git --version >nul 2>&1
if errorlevel 1 (
    echo  [AVVISO] Git non trovato — salto pull. Assicurati di avere
    echo           l'ultima versione del codice.
) else (
    git pull origin main
    if errorlevel 1 (
        echo  [AVVISO] git pull fallito — continuo con il codice locale.
    ) else (
        echo         Codice aggiornato ✓
    )
)
echo.

:: ── STEP 4: npm install ────────────────────────────────────
echo  [4/7] Installazione dipendenze npm...
echo         (potrebbe richiedere qualche minuto la prima volta^)
echo.
npm install --prefer-offline
if errorlevel 1 (
    echo.
    echo  [ERRORE] npm install fallito.
    echo  Prova: npm install --legacy-peer-deps
    pause
    exit /b 1
)
echo.
echo         Dipendenze installate ✓
echo.

:: ── STEP 5: Crea cartella assets se mancante ───────────────
echo  [5/7] Verifica assets (icone^)...
if not exist "assets" mkdir assets

if not exist "assets\icon.ico" (
    echo  [AVVISO] assets\icon.ico non trovato.
    echo           Il build userà l'icona default di Electron.
    echo           Per aggiungere la tua icona: copia icon.ico in assets\
    echo           (256x256 pixel minimo, formato ICO^)
) else (
    echo         assets\icon.ico trovato ✓
)

if not exist "assets\icon.png" (
    echo  [AVVISO] assets\icon.png non trovato ^(opzionale^).
) else (
    echo         assets\icon.png trovato ✓
)
echo.

:: ── STEP 6: Build Windows ──────────────────────────────────
echo  [6/7] Build Windows x64...
echo         Target: Installer NSIS + Portable
echo         Questo richiede 3-8 minuti...
echo.

if "%PUBLISH_FLAG%"=="always" (
    echo         Modalita: BUILD + PUBLISH su GitHub Releases
    echo.
    set GH_TOKEN=%GH_TOKEN%
    npx electron-builder --win --x64 --publish always
) else (
    echo         Modalita: BUILD LOCALE (solo file .exe^)
    echo.
    npx electron-builder --win --x64 --publish never
)

if errorlevel 1 (
    echo.
    echo  ╔══════════════════════════════════════════════════╗
    echo  ║  ERRORE durante il build!                        ║
    echo  ║                                                  ║
    echo  ║  Soluzioni comuni:                               ║
    echo  ║  1. npm install --legacy-peer-deps               ║
    echo  ║  2. Verifica che assets\icon.ico esista          ║
    echo  ║  3. Chiudi l'app BBRE se è aperta               ║
    echo  ║  4. Esegui come Amministratore                   ║
    echo  ╚══════════════════════════════════════════════════╝
    echo.
    pause
    exit /b 1
)
echo.

:: ── STEP 7: Risultato ──────────────────────────────────────
echo  [7/7] Build completato!
echo.
echo  ╔══════════════════════════════════════════════════════╗
echo  ║  ✅  BBRE Anomalie Bancarie v%APP_VERSION% — BUILD OK  ║
echo  ╚══════════════════════════════════════════════════════╝
echo.
echo  File generati in:  dist\
echo.

:: Lista file generati
if exist "dist" (
    echo  ─────────────────────────────────────────────────────
    for %%f in (dist\*.exe dist\*.yml dist\*.blockmap) do (
        echo    %%~nxf
    )
    echo  ─────────────────────────────────────────────────────
    echo.
)

if "%PUBLISH_FLAG%"=="always" (
    echo  GitHub Release pubblicata!
    echo  Vai su: https://github.com/Beppe225/BBRE-Anomalie-Bancarie/releases
    echo.
    echo  Le istanze dell'app già installate riceveranno
    echo  la notifica di aggiornamento al prossimo avvio.
) else (
    echo  [NOTA] Build locale completato. Per pubblicare su GitHub:
    echo         1. Imposta GH_TOKEN come variabile d'ambiente
    echo         2. Riesegui questo script
    echo.
    echo  Oppure installa manualmente copiando il .exe sul tuo PC.
)

echo.
echo  Premi un tasto per aprire la cartella dist\...
pause >nul
if exist "dist" start "" "dist"

endlocal
exit /b 0
