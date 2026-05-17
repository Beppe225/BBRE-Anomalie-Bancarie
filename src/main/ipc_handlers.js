/**
 * ipc_handlers.js - Handler IPC completi
 * Fix v1.1: aggiunti tutti gli handler mancanti
 */

const { ipcMain, dialog, app } = require('electron');
const { esegui_analisi } = require('../engine/orchestrator');
const { genera_pdf_buffer } = require('../reports/pdf_generator');
const path = require('path');
const fs   = require('fs');
const crypto = require('crypto');

function setupIpcHandlers() {
  console.log('🔌 Configurazione IPC Handlers...');

  // --- Helper ---
  function getDb() {
    if (!global.dbManager) throw new Error('Database non inizializzato. Riavvia l\'app.');
    const db = global.dbManager.getDb();
    if (!db) throw new Error('Database non disponibile.');
    return db;
  }

  // ── ANALISI ──────────────────────────────────────────────────────────────

  ipcMain.handle('esegui-analisi', async (event, payload) => {
    console.log('📥 Ricevuta richiesta analisi:', payload.contratto_id);
    try {
      const db = getDb();
      const risultato = await esegui_analisi(db, payload);
      console.log('✅ Analisi completata');
      return { successo: true, dati: risultato };
    } catch (err) {
      console.error('❌ Errore analisi:', err.message);
      return { successo: false, errore: err.message };
    }
  });

  // ── LISTA ANALISI ────────────────────────────────────────────────────────

  ipcMain.handle('lista-analisi', async (event, filtri = {}) => {
    try {
      const db = getDb();
      let query = "SELECT * FROM audit_analisi ORDER BY timestamp_analisi DESC";
      const res = db.exec(query);
      if (res.length === 0) return { successo: true, dati: [] };
      const cols = res[0].columns;
      const rows = res[0].values.map(row => {
        const obj = {};
        cols.forEach((c, i) => obj[c] = row[i]);
        return obj;
      });
      return { successo: true, dati: rows };
    } catch (err) {
      console.error('❌ Errore lista analisi:', err.message);
      return { successo: false, errore: err.message };
    }
  });

  // ── GET SINGOLA ANALISI ──────────────────────────────────────────────────

  ipcMain.handle('get-analisi', async (event, analisi_id) => {
    try {
      const db = getDb();
      const res = db.exec(`SELECT * FROM audit_analisi WHERE analisi_id = '${analisi_id}' LIMIT 1`);
      if (res.length === 0 || res[0].values.length === 0)
        return { successo: false, errore: 'Analisi non trovata' };
      const cols = res[0].columns;
      const obj  = {};
      cols.forEach((c, i) => obj[c] = res[0].values[0][i]);
      return { successo: true, dati: obj };
    } catch (err) {
      return { successo: false, errore: err.message };
    }
  });

  // ── GENERA REPORT PDF ────────────────────────────────────────────────────

  ipcMain.handle('genera-report', async (event, datiAnalisi) => {
    try {
      const { buffer, fileName } = await genera_pdf_buffer(datiAnalisi);

      const { filePath } = await dialog.showSaveDialog({
        defaultPath: path.join(app.getPath('documents'), fileName),
        filters: [{ name: 'PDF', extensions: ['pdf'] }]
      });

      if (!filePath) return { successo: false, errore: 'Salvataggio annullato' };

      fs.writeFileSync(filePath, buffer);

      // Salva hash PDF in audit
      const hash_pdf = crypto.createHash('sha256').update(buffer).digest('hex');
      try {
        const db = getDb();
        db.run(
          `UPDATE audit_analisi SET hash_report = '${hash_pdf}' WHERE analisi_id = '${datiAnalisi.contratto_id}'`
        );
      } catch (_) {}

      console.log('✅ PDF salvato:', filePath);
      return { successo: true, path_file: filePath, hash_pdf };
    } catch (err) {
      console.error('❌ Errore genera report:', err.message);
      return { successo: false, errore: err.message };
    }
  });

  // ── EXPORT CSV ───────────────────────────────────────────────────────────

  ipcMain.handle('export-csv', async (event, filtri = {}) => {
    try {
      const db = getDb();
      const res = db.exec("SELECT * FROM audit_analisi ORDER BY timestamp_analisi DESC");
      if (res.length === 0) return { successo: false, errore: 'Nessun dato da esportare' };

      const cols = res[0].columns;
      const rows = res[0].values;
      const csv  = [cols.join(';')]
        .concat(rows.map(r => r.map(v => (v === null ? '' : String(v).replace(/;/g, ','))).join(';')))
        .join('\r\n');

      const { filePath } = await dialog.showSaveDialog({
        defaultPath: path.join(app.getPath('documents'), `BBRE_Export_${Date.now()}.csv`),
        filters: [{ name: 'CSV', extensions: ['csv'] }]
      });

      if (!filePath) return { successo: false, errore: 'Esportazione annullata' };

      fs.writeFileSync(filePath, '\uFEFF' + csv, 'utf8'); // BOM per Excel italiano
      return { successo: true, path_file: filePath };
    } catch (err) {
      return { successo: false, errore: err.message };
    }
  });

  // ── EXPORT PIANO ANATOCISMO CSV ──────────────────────────────────────────

  ipcMain.handle('export-piano-anatocismo', async (event, { piano_rate, contratto_id }) => {
    try {
      if (!piano_rate || piano_rate.length === 0) {
        return { successo: false, errore: 'Piano rate vuoto' };
      }

      const cols = ['n', 'data_scadenza', 'rata', 'quota_interessi', 'quota_capitale',
                    'debito_residuo_inizio', 'debito_residuo_fine'];
      const header = cols.join(';');
      const rows   = piano_rate.map(r =>
        cols.map(c => r[c] != null ? String(r[c]).replace(/;/g, ',') : '').join(';')
      );
      const csv = '\uFEFF' + [header, ...rows].join('\r\n');

      const safeId   = (contratto_id || 'Piano').replace(/[^a-zA-Z0-9]/g, '_');
      const fileName = `BBRE_PianoRate_${safeId}_${Date.now()}.csv`;

      const { filePath } = await dialog.showSaveDialog({
        defaultPath: path.join(app.getPath('documents'), fileName),
        filters: [{ name: 'CSV', extensions: ['csv'] }]
      });

      if (!filePath) return { successo: false, errore: 'Esportazione annullata' };
      fs.writeFileSync(filePath, csv, 'utf8');
      console.log('✅ Piano rate salvato:', filePath);
      return { successo: true, path_file: filePath };
    } catch (err) {
      console.error('❌ Errore export piano:', err.message);
      return { successo: false, errore: err.message };
    }
  });

  // ── EXPORT EXCEL MULTI-SHEET (Sessione G) ───────────────────────────────
  // 4 sheet: Riepilogo | Voci Costo | Fattori Score | Moratori

  ipcMain.handle('export-excel', async () => {
    try {
      const XLSX = require('xlsx');
      const db   = getDb();

      const res = db.exec('SELECT * FROM audit_analisi ORDER BY timestamp_analisi DESC');
      if (res.length === 0 || res[0].values.length === 0) {
        return { successo: false, errore: 'Nessuna pratica da esportare' };
      }
      const cols    = res[0].columns;
      const pratiche = res[0].values.map(row => {
        const obj = {};
        cols.forEach((c, i) => obj[c] = row[i]);
        return obj;
      });

      // ── Sheet 1: Riepilogo ───────────────────────────────────────────────
      const sheet1 = pratiche.map(p => ({
        'ID Pratica':       p.analisi_id || '',
        'Data Analisi':     p.timestamp_analisi ? p.timestamp_analisi.substring(0,10) : '',
        'Tipo Contratto':   (p.tipo_contratto||'').replace(/_/g,' ').toUpperCase(),
        'Data Stipula':     p.data_stipula || '',
        'Capitale (€)':     p.capitale != null ? parseFloat(p.capitale) : '',
        'TAN %':            p.tan_dichiarato != null ? parseFloat((p.tan_dichiarato*100).toFixed(4)) : '',
        'Durata (mesi)':    p.durata_mesi || '',
        'TAEG Reale %':     p.teg_reale    != null ? parseFloat((p.teg_reale*100).toFixed(4))    : '',
        'Soglia Usura %':   p.soglia_usura != null ? parseFloat((p.soglia_usura*100).toFixed(4)) : '',
        'Delta (pp)':       (p.teg_reale && p.soglia_usura)
                              ? parseFloat(((p.teg_reale - p.soglia_usura)*100).toFixed(4)) : '',
        'Score (0-4)':      p.score_finale != null ? p.score_finale : '',
        'Usura Rilevata':   p.usura_rilevata ? 'SÌ' : 'NO',
        'Mora %':           p.mora_contrattuale_perc != null ? parseFloat(p.mora_contrattuale_perc) : '',
        'Score Moratori':   (() => { try { const m = JSON.parse(p.moratori_json||'null'); return m && m.applicabile ? m.score_moratori : ''; } catch(_){ return ''; } })(),
        'Score Anatocismo': (() => { try { const a = JSON.parse(p.anatocismo_json||'null'); return a && a.applicabile ? a.score_anatocismo : ''; } catch(_){ return ''; } })(),
        'Versione Engine':  p.versione_engine || ''
      }));

      // ── Sheet 2: Voci Costo ──────────────────────────────────────────────
      const sheet2 = [];
      pratiche.forEach(p => {
        try {
          const voci = JSON.parse(p.voci_json || '[]');
          voci.forEach(v => sheet2.push({
            'ID Pratica':     p.analisi_id || '',
            'Data Analisi':   p.timestamp_analisi ? p.timestamp_analisi.substring(0,10) : '',
            'Tipo Contratto': (p.tipo_contratto||'').replace(/_/g,' ').toUpperCase(),
            'Voce di Costo':  v.voce || '',
            'Importo (€)':    v.importo != null ? parseFloat(v.importo) : '',
            'Inclusa TEG':    !!v.inclusa_teg ? 'SÌ' : 'NO'
          }));
        } catch (_) {}
      });
      if (!sheet2.length) sheet2.push({ Info: 'Nessuna voce costo registrata' });

      // ── Sheet 3: Fattori Score ───────────────────────────────────────────
      const sheet3 = [];
      pratiche.forEach(p => {
        try {
          const fattori = JSON.parse(p.fattori_json || '[]');
          fattori.forEach(f => sheet3.push({
            'ID Pratica':   p.analisi_id || '',
            'Data Analisi': p.timestamp_analisi ? p.timestamp_analisi.substring(0,10) : '',
            'ID Fattore':   f.id || '',
            'Nome Fattore': f.nome || '',
            'Valore':       f.valore_label || '',
            'Impatto':      f.impatto || ''
          }));
        } catch (_) {}
      });
      if (!sheet3.length) sheet3.push({ Info: 'Nessun fattore registrato' });

      // ── Sheet 4: Moratori ────────────────────────────────────────────────
      const sheet4 = [];
      pratiche.forEach(p => {
        try {
          const m = p.moratori_json ? JSON.parse(p.moratori_json) : null;
          if (!m || !m.applicabile) return;
          sheet4.push({
            'ID Pratica':           p.analisi_id || '',
            'Data Analisi':         p.timestamp_analisi ? p.timestamp_analisi.substring(0,10) : '',
            'Mora Contrattuale %':  parseFloat(m.mora_contrattuale_perc),
            'Soglia Mora %':        parseFloat(m.soglia_mora_perc.toFixed(4)),
            'Delta Mora (pp)':      parseFloat(m.delta_mora_pp.toFixed(4)),
            'Sopra Soglia':         m.supera_soglia_mora ? 'SÌ' : 'NO',
            'Score Moratori (0-3)': m.score_moratori,
            'Label':                m.label_moratori || '',
            'TEG Complessivo %':    parseFloat(m.teg_complessivo_perc.toFixed(4))
          });
        } catch (_) {}
      });
      if (!sheet4.length) sheet4.push({ Info: 'Nessuna analisi moratori' });

      // ── Build workbook ───────────────────────────────────────────────────
      const wb  = XLSX.utils.book_new();
      const aw  = (data) => !data.length ? [] : Object.keys(data[0]).map(k => ({
        wch: Math.max(k.length, ...data.map(r => String(r[k]||'').length)) + 2
      }));

      const ws1 = XLSX.utils.json_to_sheet(sheet1); ws1['!cols'] = aw(sheet1);
      const ws2 = XLSX.utils.json_to_sheet(sheet2); ws2['!cols'] = aw(sheet2);
      const ws3 = XLSX.utils.json_to_sheet(sheet3); ws3['!cols'] = aw(sheet3);
      const ws4 = XLSX.utils.json_to_sheet(sheet4); ws4['!cols'] = aw(sheet4);

      XLSX.utils.book_append_sheet(wb, ws1, 'Riepilogo Pratiche');
      XLSX.utils.book_append_sheet(wb, ws2, 'Voci Costo');
      XLSX.utils.book_append_sheet(wb, ws3, 'Fattori Score');
      XLSX.utils.book_append_sheet(wb, ws4, 'Moratori');

      const { filePath } = await dialog.showSaveDialog({
        defaultPath: path.join(app.getPath('documents'), `BBRE_Export_${Date.now()}.xlsx`),
        filters: [{ name: 'Excel', extensions: ['xlsx'] }]
      });
      if (!filePath) return { successo: false, errore: 'Esportazione annullata' };

      XLSX.writeFile(wb, filePath);
      console.log('✅ Excel esportato:', filePath);
      return { successo: true, path_file: filePath, num_pratiche: pratiche.length };

    } catch (err) {
      console.error('❌ Errore export-excel:', err.message);
      return { successo: false, errore: err.message };
    }
  });

  // ── BACKUP DB ────────────────────────────────────────────────────────────

  ipcMain.handle('backup-db', async () => {
    try {
      const db = getDb();
      const data = db.export(); // sql.js -> Uint8Array
      const buffer = Buffer.from(data);

      const { filePath } = await dialog.showSaveDialog({
        defaultPath: path.join(app.getPath('documents'), `BBRE_Backup_${Date.now()}.sqlite`),
        filters: [{ name: 'SQLite', extensions: ['sqlite'] }]
      });

      if (!filePath) return { successo: false, errore: 'Backup annullato' };

      fs.writeFileSync(filePath, buffer);
      console.log('✅ Backup DB salvato:', filePath);
      return { successo: true, path_file: filePath };
    } catch (err) {
      return { successo: false, errore: err.message };
    }
  });

  // ── GET CONFIG ───────────────────────────────────────────────────────────

  ipcMain.handle('get-config', async () => {
    try {
      const db = getDb();
      const res = db.exec("SELECT chiave, valore FROM config_app");
      if (res.length === 0) return { successo: true, dati: {} };
      const config = {};
      res[0].values.forEach(([k, v]) => config[k] = v);
      return { successo: true, dati: config };
    } catch (err) {
      return { successo: false, errore: err.message };
    }
  });

  // ── AGGIORNAMENTO SOGLIE ─────────────────────────────────────────────────

  ipcMain.handle('controlla-aggiornamenti-soglie', async () => {
    try {
      const { controlla_e_aggiorna_soglie } = require('../db/soglie_updater');
      const db = getDb();
      const result = await controlla_e_aggiorna_soglie(db);
      return { successo: true, dati: result };
    } catch (err) {
      return { successo: false, errore: err.message };
    }
  });

  // ── DATI MERCATO (widget sidebar) ────────────────────────────────────────

  ipcMain.handle('get-market-data', async () => {
    try {
      const { getMarketData } = require('../market/fetcher');
      const data = await getMarketData();
      return { successo: true, dati: data };
    } catch (err) {
      return { successo: false, errore: err.message };
    }
  });

  // ── ELIMINA ANALISI ─────────────────────────────────────────────────────

  ipcMain.handle('elimina-analisi', async (event, analisi_id) => {
    try {
      const db = getDb();
      db.run(`DELETE FROM audit_analisi WHERE analisi_id = ?`, [analisi_id]);
      global.dbManager.save();
      console.log('🗑️  Pratica eliminata:', analisi_id);
      return { successo: true };
    } catch (err) {
      console.error('❌ Errore elimina-analisi:', err.message);
      return { successo: false, errore: err.message };
    }
  });

  // ── CARICA DOCUMENTO (Sessione E — Parser LLM) ───────────────────────────
  // Riceve il path del file scelto dall'utente, lancia il parser LLM e
  // restituisce i dati pronti per pre-compilare Step 1.
  // SICUREZZA: api_key letta dal DB nel main process, mai esposta al renderer.

  ipcMain.handle('carica-documento', async (event, filePath) => {
    try {
      if (!filePath || typeof filePath !== 'string') {
        return { successo: false, errore: 'Percorso file non valido' };
      }
      const { analizzaDocumento, leggiConfigLLM } = require('../parser/parser_orchestrator');
      const db        = getDb();
      const configLLM = leggiConfigLLM(db);
      const risultato = await analizzaDocumento(filePath, configLLM);
      return risultato;
    } catch (err) {
      console.error('❌ Errore carica-documento:', err.message);
      return { successo: false, errore: err.message };
    }
  });

  // ── APRI DIALOG FILE (Sessione E) ─────────────────────────────────────────
  // Il renderer non può aprire dialog file nativi: lo fa il main process.

  ipcMain.handle('apri-dialog-file', async () => {
    try {
      const { filePaths, canceled } = await dialog.showOpenDialog({
        title: 'Seleziona documento bancario',
        filters: [
          { name: 'Documenti', extensions: ['pdf', 'jpg', 'jpeg', 'png'] },
          { name: 'PDF', extensions: ['pdf'] },
          { name: 'Immagini', extensions: ['jpg', 'jpeg', 'png'] }
        ],
        properties: ['openFile']
      });
      if (canceled || !filePaths || filePaths.length === 0) {
        return { successo: false, errore: 'Nessun file selezionato' };
      }
      return { successo: true, filePath: filePaths[0] };
    } catch (err) {
      return { successo: false, errore: err.message };
    }
  });

  // ── SALVA CONFIG LLM (Sessione E — Settings) ─────────────────────────────
  // Salva provider e api_key nel DB. L'api_key NON viene mai rimandata al renderer.

  ipcMain.handle('salva-config-llm', async (event, { provider, api_key }) => {
    try {
      const db = getDb();
      // Upsert provider
      const hasProvider = db.exec("SELECT chiave FROM config_app WHERE chiave='llm_provider'");
      if (hasProvider.length > 0 && hasProvider[0].values.length > 0) {
        db.run("UPDATE config_app SET valore=?, updated_at=CURRENT_TIMESTAMP WHERE chiave='llm_provider'",
               [provider || 'claude']);
      } else {
        db.run("INSERT INTO config_app (chiave, valore, descrizione) VALUES ('llm_provider', ?, 'Provider LLM parser documenti')",
               [provider || 'claude']);
      }
      // Upsert api_key
      const hasKey = db.exec("SELECT chiave FROM config_app WHERE chiave='llm_api_key'");
      if (hasKey.length > 0 && hasKey[0].values.length > 0) {
        db.run("UPDATE config_app SET valore=?, updated_at=CURRENT_TIMESTAMP WHERE chiave='llm_api_key'",
               [api_key || '']);
      } else {
        db.run("INSERT INTO config_app (chiave, valore, descrizione) VALUES ('llm_api_key', ?, 'API key LLM parser documenti')",
               [api_key || '']);
      }
      global.dbManager.save();
      console.log('✅ Config LLM salvata (provider:', provider, ')');
      return { successo: true };
    } catch (err) {
      console.error('❌ Errore salva-config-llm:', err.message);
      return { successo: false, errore: err.message };
    }
  });

  // ── LEGGI CONFIG LLM (Sessione E — Settings UI) ──────────────────────────
  // Restituisce provider e se l'api_key è presente (NON la key stessa).

  ipcMain.handle('get-config-llm', async () => {
    try {
      const db  = getDb();
      const res = db.exec("SELECT chiave, valore FROM config_app WHERE chiave IN ('llm_provider','llm_api_key')");
      const cfg = { provider: 'claude', api_key_presente: false };
      if (res.length > 0) {
        res[0].values.forEach(([k, v]) => {
          if (k === 'llm_provider') cfg.provider = v || 'claude';
          if (k === 'llm_api_key')  cfg.api_key_presente = !!(v && v.trim() !== '');
        });
      }
      return { successo: true, dati: cfg };
    } catch (err) {
      return { successo: false, errore: err.message };
    }
  });

  // ── STATISTICHE ARCHIVIO (Sessione K — Dashboard) ───────────────────────

  ipcMain.handle('get-statistiche', async () => {
    try {
      const db = getDb();
      // Query tutti i dati necessari per la dashboard
      const res = db.exec('SELECT * FROM audit_analisi ORDER BY timestamp_analisi ASC');
      if (res.length === 0 || res[0].values.length === 0) {
        return { successo: true, dati: { totale: 0, vuoto: true } };
      }

      const cols    = res[0].columns;
      const pratiche = res[0].values.map(row => {
        const o = {};
        cols.forEach((c, i) => o[c] = row[i]);
        return o;
      });

      const totale = pratiche.length;

      // Distribuzione score
      const per_score = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0 };
      pratiche.forEach(p => {
        const s = parseInt(p.score_finale) || 0;
        per_score[s] = (per_score[s] || 0) + 1;
      });

      // Distribuzione per tipo
      const per_tipo = {};
      pratiche.forEach(p => {
        const t = p.tipo_contratto || 'sconosciuto';
        per_tipo[t] = (per_tipo[t] || 0) + 1;
      });

      // Usura rilevata
      const con_usura    = pratiche.filter(p => p.usura_rilevata).length;
      const senza_usura  = totale - con_usura;
      const pct_usura    = totale > 0 ? (con_usura / totale * 100).toFixed(1) : 0;

      // Score medio
      const score_sum  = pratiche.reduce((s, p) => s + (parseInt(p.score_finale) || 0), 0);
      const score_medio = totale > 0 ? (score_sum / totale).toFixed(2) : 0;

      // TEG medio e soglia media
      const pratiche_con_teg = pratiche.filter(p => p.teg_reale != null);
      const teg_medio = pratiche_con_teg.length > 0
        ? (pratiche_con_teg.reduce((s, p) => s + parseFloat(p.teg_reale), 0) / pratiche_con_teg.length * 100).toFixed(4)
        : null;

      // Capitale totale analizzato
      const capitale_totale = pratiche.reduce((s, p) => s + (parseFloat(p.capitale) || 0), 0);

      // Delta medio (in pp) per le pratiche con usura
      const pratiche_usura = pratiche.filter(p => p.usura_rilevata && p.teg_reale && p.soglia_usura);
      const delta_medio_usura = pratiche_usura.length > 0
        ? (pratiche_usura.reduce((s, p) => s + (parseFloat(p.teg_reale) - parseFloat(p.soglia_usura)) * 100, 0) / pratiche_usura.length).toFixed(2)
        : null;

      // Trend mensile (ultimi 12 mesi)
      const trend_mensile = {};
      const oggi = new Date();
      for (let i = 11; i >= 0; i--) {
        const d = new Date(oggi.getFullYear(), oggi.getMonth() - i, 1);
        const k = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
        trend_mensile[k] = { totale: 0, usura: 0 };
      }
      pratiche.forEach(p => {
        if (!p.timestamp_analisi) return;
        const k = p.timestamp_analisi.substring(0, 7);
        if (trend_mensile[k]) {
          trend_mensile[k].totale++;
          if (p.usura_rilevata) trend_mensile[k].usura++;
        }
      });

      // Con moratori / anatocismo
      const con_moratori   = pratiche.filter(p => p.moratori_json && p.moratori_json !== 'null').length;
      const con_anatocismo = pratiche.filter(p => {
        try { const a = JSON.parse(p.anatocismo_json||'null'); return a && a.applicabile; } catch(_){ return false; }
      }).length;

      // Prima e ultima pratica
      const prima  = pratiche[0]?.timestamp_analisi?.substring(0,10) || '—';
      const ultima = pratiche[pratiche.length-1]?.timestamp_analisi?.substring(0,10) || '—';

      return {
        successo: true,
        dati: {
          totale, vuoto: false,
          con_usura, senza_usura, pct_usura,
          score_medio, per_score, per_tipo,
          teg_medio, capitale_totale,
          delta_medio_usura,
          con_moratori, con_anatocismo,
          trend_mensile,
          prima_pratica: prima,
          ultima_pratica: ultima
        }
      };
    } catch (err) {
      console.error('❌ Errore get-statistiche:', err.message);
      return { successo: false, errore: err.message };
    }
  });

  // ── ANALISI NPL/STRALCIO (Sessione NPL) ─────────────────────────────────

  ipcMain.handle('analizza-npl', async (event, payload) => {
    try {
      const { analizza_npl } = require('../engine/normativa/npl_engine');
      const risultato = analizza_npl(payload);
      console.log('📊 NPL analisi completata — ROI:', risultato.roi_pct?.toFixed(2) + '%');
      return { successo: true, dati: risultato };
    } catch (err) {
      console.error('❌ Errore analizza-npl:', err.message);
      return { successo: false, errore: err.message };
    }
  });

  console.log('✅ IPC Handlers registrati (18 canali — v1.2.0)');
}

module.exports = { setupIpcHandlers };