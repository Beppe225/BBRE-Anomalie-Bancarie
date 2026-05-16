const fetch = require('node-fetch');  // ✅ node-fetch@2 funziona con require()
const XLSX = require('xlsx');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// URL ufficiale BdI (mock di default per testing)
const BDI_URL = 'https://bip.bancaditalia.it/produzione/clear/TEGM/2810_0/TEGM.csv';
const USE_MOCK = process.env.ENABLE_REALTIME_MARKET !== 'true';

function calcolaHash(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function applicaFormulaSoglia(tegm, anno) {
  const t = parseFloat(tegm);
  if (isNaN(t)) return null;
  if (anno < 2011) return (t * 1.5).toFixed(4);
  const delta = (t * 0.25) + 4;
  const cappedDelta = Math.min(delta, 8);
  return (t + cappedDelta).toFixed(4);
}

async function controlla_e_aggiorna_soglie(db) {
  try {
    console.log('🔄 [SoglieUpdater] Verifica aggiornamenti BdItalia...');
    
    let buffer;
    if (USE_MOCK) {
      console.log('⚠️ Modalità MOCK attiva (nessun fetch esterno)');
      buffer = Buffer.from('anno,trimestre,categoria,tegm\n2024,1,mutuo_ipotecario,3.50\n2024,2,mutuo_ipotecario,3.65\n');
    } else {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      try {
        const res = await fetch(BDI_URL, { signal: controller.signal });
        clearTimeout(timeoutId);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        buffer = await res.buffer();  // ✅ node-fetch@2 usa .buffer()
      } catch (fetchError) {
        clearTimeout(timeoutId);
        throw fetchError;
      }
    }

    const hashCorrente = calcolaHash(buffer);
    const lastHashRow = db.exec("SELECT valore FROM config_app WHERE chiave='ultimo_hash_soglie'");
    const ultimoHash = lastHashRow.length > 0 ? lastHashRow[0].values[0][0] : null;

    if (ultimoHash === hashCorrente) {
      console.log('✅ [SoglieUpdater] Dataset già aggiornato. Uscita.');
      return { aggiornato: false, nuove_righe: 0, messaggio: 'Nessuna novità' };
    }

    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const jsonData = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);

    const colonneRichieste = ['anno', 'trimestre', 'categoria', 'tegm'];
    const primaRiga = jsonData[0] || {};
    const colonneMancanti = colonneRichieste.filter(c => !(c in primaRiga));
    
    if (colonneMancanti.length > 0) {
      console.warn(`⚠️ [SoglieUpdater] Formato non riconosciuto. Colonne mancanti: ${colonneMancanti.join(', ')}`);
      return { aggiornato: false, nuove_righe: 0, errore: 'Formato CSV non valido' };
    }

    db.run("BEGIN TRANSACTION");
    let nuoveRighe = 0;

    for (const row of jsonData) {
      const anno = parseInt(row.anno);
      const trimestre = parseInt(row.trimestre);
      const tipo = row.categoria?.toLowerCase().replace(/\s+/g, '_') || 'altro';
      const tegm = parseFloat(row.tegm);
      if (isNaN(anno) || isNaN(trimestre) || isNaN(tegm)) continue;

      const tassoSoglia = applicaFormulaSoglia(tegm, anno);
      const stmt = `INSERT OR IGNORE INTO soglie_usura (anno, trimestre, tipo_contratto, tegm, tasso_soglia, hash_dataset, data_pubblicazione) VALUES (?, ?, ?, ?, ?, ?, ?)`;
      const res = db.run(stmt, [anno, trimestre, tipo, tegm.toFixed(4), tassoSoglia, hashCorrente, new Date().toISOString().split('T')[0]]);
      if (res.changes > 0) nuoveRighe++;
    }

    if (ultimoHash) {
      db.run("UPDATE config_app SET valore=?, updated_at=CURRENT_TIMESTAMP WHERE chiave='ultimo_hash_soglie'", [hashCorrente]);
    } else {
      db.run("INSERT INTO config_app (chiave, valore) VALUES ('ultimo_hash_soglie', ?)", [hashCorrente]);
    }

    db.run("COMMIT");
    console.log(`✅ [SoglieUpdater] Importate ${nuoveRighe} nuove soglie. Hash: ${hashCorrente.slice(0,8)}...`);
    return { aggiornato: true, nuove_righe: nuoveRighe, versione_dataset: hashCorrente };
  } catch (err) {
    console.error('❌ [SoglieUpdater] Errore:', err.message);
    return { aggiornato: false, nuove_righe: 0, errore: err.message };
  }
}

module.exports = { controlla_e_aggiorna_soglie };
