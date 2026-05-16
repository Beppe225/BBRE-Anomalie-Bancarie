// Stato Globale
const AppState = {
  step: 1,
  contratto: {},
  costi: []
};

// Funzioni esposte al renderer
window.app = {
  nav: (page) => {
    if (page === 'nuova') {
      app.resetForm();
    } else if (page === 'archivio') {
      app.loadArchive();
      document.querySelectorAll('.step').forEach(el => el.classList.remove('active'));
      const s = document.getElementById('step-archivio');
      if (s) s.classList.add('active');
    } else if (page === 'impostazioni') {
      app.loadSettings();
    }
  },

  goToStep: (target) => {
    console.log('Navigazione verso Step:', target);
    
    if (AppState.step === 1 && target === 2) {
      const tipo    = document.getElementById('tipo').value;
      const data    = document.getElementById('data').value;
      const capitale = document.getElementById('capitale').value;
      const tan     = document.getElementById('tan').value;
      const durata  = document.getElementById('durata') ? document.getElementById('durata').value : '84';

      if (!tipo || !data || !capitale || !tan) {
        alert('⚠️ Compila tutti i campi obbligatori!');
        return;
      }

      AppState.contratto = {
        contratto_id:  'BBRE-' + Date.now(),
        tipo_contratto: tipo,
        data_stipula:  data,
        capitale:      parseFloat(capitale),
        tan_dichiarato: parseFloat(tan) / 100,
        durata_mesi:   parseInt(durata) || 84
      };
      console.log('✅ Dati contratto salvati:', AppState.contratto);
    }

    document.querySelectorAll('.step').forEach(el => el.classList.remove('active'));
    const next = document.getElementById('step-' + target);
    if (next) {
      next.classList.add('active');
      AppState.step = target;
    }
  },

  addCost: (type) => {
    console.log('🖱️ Click su:', type);
    
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal-content" style="background:#1e1e1e;padding:30px;border-radius:8px;border:2px solid #c9a227;max-width:400px;">
        <h3 style="color:#c9a227;margin-top:0;">Aggiungi ${type}</h3>
        <input type="number" id="temp-cost-input" step="0.01" placeholder="Importo in €" 
               style="width:100%;padding:12px;margin:15px 0;background:#222;border:1px solid #444;color:#fff;font-size:18px;" autofocus>
        <div style="display:flex;gap:10px;justify-content:flex-end;">
          <button id="btn-cancel" style="padding:10px 20px;background:#333;color:#fff;border:none;cursor:pointer;">Annulla</button>
          <button id="btn-confirm" style="padding:10px 20px;background:#c9a227;color:#000;border:none;cursor:pointer;font-weight:bold;">Conferma</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.8);display:flex;align-items:center;justify-content:center;z-index:9999;';
    
    const input = document.getElementById('temp-cost-input');
    input.focus();
    
    const close = () => modal.remove();
    
    const confirm = () => {
      const importo = parseFloat(input.value);
      if (isNaN(importo) || importo <= 0) {
        alert('Inserisci un importo valido!');
        input.focus();
        return;
      }
      AppState.costi.push({ id: Date.now(), voce: type, importo: importo, inclusa: true });
      console.log('✅ Aggiunto:', type, importo);
      close();
      app.renderCosts();
    };
    
    document.getElementById('btn-confirm').onclick = confirm;
    document.getElementById('btn-cancel').onclick = close;
    input.onkeydown = (e) => { if (e.key === 'Enter') confirm(); if (e.key === 'Escape') close(); };
  },

  renderCosts: () => {
    const tbody = document.getElementById('cost-list');
    if (!tbody) return;
    tbody.innerHTML = '';
    if (AppState.costi.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:#666;padding:15px;">Nessuna voce inserita</td></tr>';
      return;
    }
    AppState.costi.forEach((c, i) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="padding:10px;">${c.voce}</td>
        <td style="padding:10px;">€ ${c.importo.toFixed(2)}</td>
        <td style="padding:10px;"><input type="checkbox" ${c.inclusa ? 'checked' : ''} onchange="app.toggleCost(${i})"></td>
        <td style="padding:10px;"><button onclick="app.removeCost(${i})" style="color:#ff4d4d;background:none;border:none;cursor:pointer;font-size:18px;">✕</button></td>
      `;
      tbody.appendChild(tr);
    });
  },

  toggleCost: (idx) => { AppState.costi[idx].inclusa = !AppState.costi[idx].inclusa; },
  removeCost: (idx) => { AppState.costi.splice(idx, 1); app.renderCosts(); },

  runAnalysis: async () => {
    console.log('🚀 Avvio Analisi...');
    if (AppState.costi.length === 0) {
      alert('⚠️ Aggiungi almeno una voce di costo!');
      return;
    }
    try {
      const payload = {
        ...AppState.contratto,
        voci: AppState.costi.map(c => ({ voce: c.voce, importo: c.importo, inclusa_teg: c.inclusa }))
      };
      console.log('📤 Payload inviato:', payload);
      const result = await window.electronAPI.invoke('esegui-analisi', payload);
      if (result.successo) {
        app.showResults(result.dati);
        app.goToStep(3);
      } else {
        alert('❌ Errore Analisi: ' + result.errore);
      }
    } catch (err) {
      console.error('Errore IPC:', err);
      alert('❌ Errore di comunicazione: ' + err.message);
    }
  },

  showResults: (data) => {
    console.log('📊 Risultati ricevuti:', data);
    AppState.ultimaAnalisi = data;

    // TAN
    const tanPerc = (AppState.contratto.tan_dichiarato * 100).toFixed(2);
    document.getElementById('res-tan').innerText = tanPerc + '%';

    // TAEG reale — già in decimale (es. 0.176)
    const tegPerc = (data.teg * 100).toFixed(4);
    document.getElementById('res-teg').innerText = tegPerc + '%';

    // Soglia — può arrivare come decimale (0.0625) o percentuale (6.25)
    const sogliaPerc = (data.soglia > 1 ? data.soglia : data.soglia * 100).toFixed(4);
    document.getElementById('res-soglia').innerText = sogliaPerc + '%';

    // Score
    document.getElementById('score-val').innerText = data.score;

    // Label score
    const scoreLabel = document.getElementById('score-label');
    if (scoreLabel) {
      const labels = {
        0: 'Nessuna anomalia rilevata',
        1: 'Zona grigia — dati insufficienti',
        2: 'Anomalia possibile',
        3: 'Anomalia probabile',
        4: 'Caso forte per contenzioso'
      };
      scoreLabel.innerText = labels[data.score] || '';
    }

    // Affidabilità
    const affEl = document.getElementById('res-aff');
    if (affEl) affEl.innerText = data.affidabilita || '-';

    // Orientamento giurisprudenziale
    const oriEl = document.getElementById('res-orientamento');
    if (oriEl) oriEl.innerText = data.orientamento_giurisp || '-';

    // Scheda Fattori F1-F6
    const tbody = document.getElementById('factors-list');
    if (tbody && data.fattori) {
      tbody.innerHTML = '';
      data.fattori.forEach(f => {
        const label = f.valore_label !== undefined ? f.valore_label : (f.valore !== undefined ? f.valore : '-');
        const impatto = f.impatto !== undefined ? f.impatto : (f.peso !== undefined ? (f.peso * 100).toFixed(0) + '%' : '-');
        tbody.innerHTML += `
          <tr>
            <td style="padding:8px;color:#c9a227;font-weight:bold;">${f.id}</td>
            <td style="padding:8px;">${f.nome}</td>
            <td style="padding:8px;">${label}</td>
            <td style="padding:8px;">${impatto}</td>
          </tr>`;
      });
    }

    // Delta pp se disponibile
    const deltaEl = document.getElementById('res-delta');
    if (deltaEl && data.delta_pp !== undefined) {
      deltaEl.innerText = (data.delta_pp > 0 ? '+' : '') + data.delta_pp.toFixed(2) + 'pp';
      deltaEl.style.color = data.delta_pp > 0 ? '#ff4d4d' : '#4dff88';
    }

    // ── SEZIONE ANATOCISMO ──────────────────────────────────────────────────
    const anatEl = document.getElementById('anatocismo-section');
    if (anatEl && data.anatocismo && data.anatocismo.applicabile) {
      const a = data.anatocismo;

      // Score color
      const scoreColors = { 0: '#4dff88', 1: '#ffd700', 2: '#ff8c00', 3: '#ff4d4d' };
      const scoreColor  = scoreColors[a.score_anatocismo] || '#ffffff';

      // Genera righe fattori
      let fattoriHtml = '';
      (a.fattori_anatocismo || []).forEach(f => {
        fattoriHtml += `<tr>
          <td style="padding:6px;color:#c9a227;font-weight:bold;">${f.id}</td>
          <td style="padding:6px;">${f.nome}</td>
          <td style="padding:6px;font-size:12px;">${f.valore_label}</td>
          <td style="padding:6px;">${f.impatto}</td>
        </tr>`;
      });

      anatEl.innerHTML = `
        <div style="margin-top:20px;border:1px solid #c9a227;border-radius:6px;overflow:hidden;">
          <div id="anatocismo-header" onclick="app.toggleAnatocismo()"
               style="background:#1a1a1a;padding:14px 18px;cursor:pointer;display:flex;justify-content:space-between;align-items:center;">
            <span style="color:#c9a227;font-weight:bold;font-size:15px;">
              ⚖️ Analisi Ammortamento alla Francese
            </span>
            <span style="color:#c9a227;" id="anatocismo-toggle">▼ Espandi</span>
          </div>

          <div id="anatocismo-body" style="display:none;padding:18px;background:#161616;">

            <!-- Banner giurisprudenza SEMPRE visibile -->
            <div style="background:#2a1a00;border:1px solid #c9a227;border-radius:4px;padding:12px;margin-bottom:16px;font-size:12px;color:#ffd700;">
              ⚠️ <strong>ORIENTAMENTO GIURISPRUDENZIALE DIVISO</strong><br>
              Favorevole: Cass. 2232/2020 | Contrario: Cass. <strong>SU 15130/2024</strong> (peso elevato)<br>
              <em>${a.disclaimer}</em>
            </div>

            <!-- Score e delta -->
            <div style="display:flex;gap:20px;margin-bottom:16px;flex-wrap:wrap;">
              <div style="background:#1e1e1e;padding:14px 20px;border-radius:6px;border:1px solid #333;min-width:140px;text-align:center;">
                <div style="color:#888;font-size:11px;text-transform:uppercase;">Score Anatocismo</div>
                <div style="font-size:36px;font-weight:bold;color:${scoreColor};">${a.score_anatocismo}<span style="font-size:16px;color:#666;">/3</span></div>
              </div>
              <div style="background:#1e1e1e;padding:14px 20px;border-radius:6px;border:1px solid #333;min-width:160px;text-align:center;">
                <div style="color:#888;font-size:11px;text-transform:uppercase;">Delta Stimato</div>
                <div style="font-size:26px;font-weight:bold;color:${scoreColor};">€${a.delta_euro.toFixed(2)}</div>
                <div style="color:#888;font-size:11px;">${a.delta_pct.toFixed(4)}% su tot. interessi</div>
              </div>
              <div style="background:#1e1e1e;padding:14px 20px;border-radius:6px;border:1px solid #333;flex:1;min-width:200px;">
                <div style="color:#888;font-size:11px;text-transform:uppercase;margin-bottom:6px;">Interessi Francese vs Puro</div>
                <div style="font-size:13px;">Francese: <strong>€${a.totale_interessi_francese.toFixed(2)}</strong></div>
                <div style="font-size:13px;">Puro: <strong>€${a.totale_interessi_puro.toFixed(2)}</strong></div>
              </div>
            </div>

            <!-- Fattori -->
            <table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:14px;">
              <thead>
                <tr style="background:#222;">
                  <th style="padding:8px;text-align:left;color:#c9a227;">ID</th>
                  <th style="padding:8px;text-align:left;color:#c9a227;">Fattore</th>
                  <th style="padding:8px;text-align:left;color:#c9a227;">Valore</th>
                  <th style="padding:8px;text-align:left;color:#c9a227;">Impatto</th>
                </tr>
              </thead>
              <tbody id="anatocismo-fattori">${fattoriHtml}</tbody>
            </table>

            <!-- Piano rate e export CSV -->
            ${a.piano_rate && a.piano_rate.length > 0 ? `
            <div style="margin-top:10px;">
              <button onclick="app.exportPianoCSV()" style="
                padding:8px 16px;background:#c9a227;color:#000;border:none;
                cursor:pointer;font-weight:bold;border-radius:4px;font-size:12px;">
                📊 Scarica Piano Rate (CSV)
              </button>
              <span style="color:#666;font-size:11px;margin-left:10px;">${a.piano_rate.length} rate ricostruite</span>
            </div>` : ''}

          </div>
        </div>
      `;
      anatEl.style.display = 'block';
    } else if (anatEl) {
      anatEl.innerHTML = '';
      anatEl.style.display = 'none';
    }
  },

  generatePDF: async () => {
    try {
      if (!AppState.ultimaAnalisi) {
        alert('⚠️ Esegui prima un\'analisi!');
        return;
      }
      const payload = {
        ...AppState.contratto,
        ...AppState.ultimaAnalisi,
        voci: AppState.costi
      };
      const result = await window.electronAPI.invoke('genera-report', payload);
      if (result.successo) {
        alert('✅ Report PDF salvato in:\n' + result.path_file);
      } else {
        alert('❌ Errore PDF: ' + result.errore);
      }
    } catch (err) {
      alert('❌ Errore: ' + err.message);
    }
  },

  toggleAnatocismo: () => {
    const body   = document.getElementById('anatocismo-body');
    const toggle = document.getElementById('anatocismo-toggle');
    if (!body) return;
    if (body.style.display === 'none') {
      body.style.display = 'block';
      if (toggle) toggle.innerText = '▲ Comprimi';
    } else {
      body.style.display = 'none';
      if (toggle) toggle.innerText = '▼ Espandi';
    }
  },

  exportPianoCSV: async () => {
    try {
      const a = AppState.ultimaAnalisi && AppState.ultimaAnalisi.anatocismo;
      if (!a || !a.piano_rate || a.piano_rate.length === 0) {
        alert('⚠️ Piano rate non disponibile!');
        return;
      }
      const result = await window.electronAPI.invoke('export-piano-anatocismo', {
        piano_rate:  a.piano_rate,
        contratto_id: AppState.contratto.contratto_id
      });
      if (result.successo) {
        alert('✅ Piano rate salvato:\n' + result.path_file);
      } else {
        alert('❌ Errore: ' + result.errore);
      }
    } catch (err) {
      alert('❌ Errore: ' + err.message);
    }
  },

  loadArchive: async () => {
    console.log('📂 Carico Archivio');
    const container = document.getElementById('step-archivio');
    if (!container) return;

    container.innerHTML = '<h2>📂 Archivio Pratiche</h2><p style="color:#666;">⏳ Caricamento...</p>';

    try {
      const result = await window.electronAPI.invoke('lista-analisi');
      if (!result.successo) throw new Error(result.errore);

      const pratiche = result.dati;

      if (!pratiche || pratiche.length === 0) {
        container.innerHTML = `
          <h2>📂 Archivio Pratiche</h2>
          <p style="color:#666; margin-top:20px;">Nessuna pratica salvata. Esegui una nuova analisi.</p>`;
        return;
      }

      const righe = pratiche.map(p => {
        const data  = p.timestamp_analisi ? p.timestamp_analisi.substring(0,10) : '—';
        const teg   = p.teg_reale != null ? (parseFloat(p.teg_reale)*100).toFixed(4)+'%' : '—';
        const soglia = p.soglia_usura != null ? (parseFloat(p.soglia_usura)*100).toFixed(4)+'%' : '—';
        const score  = p.score_finale != null ? p.score_finale : '—';
        const usura  = p.usura_rilevata ? '<span style="color:#ff4d4d;font-weight:bold;">⚠️ SÌ</span>' : '<span style="color:#4caf50;">NO</span>';
        const tipo   = (p.tipo_contratto || '—').replace('_', ' ').toUpperCase();
        const cap    = p.capitale != null ? '€ ' + parseFloat(p.capitale).toLocaleString('it-IT') : '—';
        const id     = p.analisi_id || '—';

        return `
          <tr style="border-bottom:1px solid #222;" id="row-${id}">
            <td style="padding:10px 8px; color:#c9a227; font-size:12px; cursor:pointer;" onclick="app.apriPratica('${id}')">${data}</td>
            <td style="padding:10px 8px; font-size:11px; color:#888; cursor:pointer;" onclick="app.apriPratica('${id}')">${id.substring(0,14)}…</td>
            <td style="padding:10px 8px; font-size:12px; cursor:pointer;" onclick="app.apriPratica('${id}')">${tipo}</td>
            <td style="padding:10px 8px; font-size:12px; cursor:pointer;" onclick="app.apriPratica('${id}')">${cap}</td>
            <td style="padding:10px 8px; font-size:12px; cursor:pointer;" onclick="app.apriPratica('${id}')">${teg}</td>
            <td style="padding:10px 8px; font-size:12px; cursor:pointer;" onclick="app.apriPratica('${id}')">${soglia}</td>
            <td style="padding:10px 8px; font-size:13px; text-align:center; cursor:pointer;" onclick="app.apriPratica('${id}')">${score}</td>
            <td style="padding:10px 8px; text-align:center; cursor:pointer;" onclick="app.apriPratica('${id}')">${usura}</td>
            <td style="padding:6px 8px; text-align:center;">
              <button onclick="app.eliminaPratica('${id}')" title="Elimina pratica"
                style="background:none; border:1px solid #444; color:#ff4d4d; cursor:pointer;
                       font-size:14px; border-radius:3px; padding:2px 8px; line-height:1;">✕</button>
            </td>
          </tr>`;
      }).join('');

      container.innerHTML = `
        <h2>📂 Archivio Pratiche</h2>
        <p style="color:#666; font-size:12px; margin-bottom:16px;">${pratiche.length} pratich${pratiche.length===1?'a':'e'} trovata${pratiche.length===1?'':'e'} — clicca una riga per riaprirla</p>
        <div style="overflow-x:auto;">
          <table style="width:100%; border-collapse:collapse; font-size:13px;">
            <thead>
              <tr style="background:#1a1a1a; border-bottom:2px solid #c9a227;">
                <th style="padding:10px 8px; text-align:left; color:#c9a227;">Data</th>
                <th style="padding:10px 8px; text-align:left; color:#c9a227;">ID Pratica</th>
                <th style="padding:10px 8px; text-align:left; color:#c9a227;">Tipo</th>
                <th style="padding:10px 8px; text-align:left; color:#c9a227;">Capitale</th>
                <th style="padding:10px 8px; text-align:left; color:#c9a227;">TAEG Reale</th>
                <th style="padding:10px 8px; text-align:left; color:#c9a227;">Soglia</th>
                <th style="padding:10px 8px; text-align:center; color:#c9a227;">Score</th>
                <th style="padding:10px 8px; text-align:center; color:#c9a227;">Usura</th>
                <th style="padding:10px 8px; text-align:center; color:#c9a227;">Azioni</th>
              </tr>
            </thead>
            <tbody>${righe}</tbody>
          </table>
        </div>
        <div style="margin-top:16px; display:flex; gap:10px;">
          <button onclick="app.nav('nuova')" style="padding:10px 20px; background:#c9a227; color:#000; border:none; cursor:pointer; font-weight:bold; border-radius:4px;">
            + Nuova Pratica
          </button>
          <button onclick="app.exportCSVArchivio()" style="padding:10px 20px; background:#333; color:#fff; border:1px solid #555; cursor:pointer; border-radius:4px;">
            📊 Esporta CSV
          </button>
        </div>`;
    } catch (err) {
      container.innerHTML = `<h2>📂 Archivio Pratiche</h2><p style="color:#ff4d4d;">❌ Errore: ${err.message}</p>`;
    }
  },

  // Riapre una pratica dall'archivio mostrando i risultati
  apriPratica: async (analisiId) => {
    try {
      const result = await window.electronAPI.invoke('get-analisi', analisiId);
      if (!result.successo) throw new Error(result.errore);

      const p = result.dati;
      // Ricostruisce AppState dal dato salvato
      AppState.contratto = {
        contratto_id:   p.analisi_id,
        tipo_contratto: p.tipo_contratto,
        data_stipula:   p.data_stipula,
        capitale:       parseFloat(p.capitale),
        tan_dichiarato: parseFloat(p.tan_dichiarato),
        durata_mesi:    parseInt(p.durata_mesi) || 84
      };

      // Ricostruisce l'oggetto risultato da audit_analisi
      // Normalizza i nomi al formato atteso da showResults (teg, soglia, score)
      const fattoriParsed    = p.fattori_json    ? JSON.parse(p.fattori_json)    : [];
      const anatocismoParsed = p.anatocismo_json ? JSON.parse(p.anatocismo_json) : null;
      AppState.ultimaAnalisi = {
        teg:               parseFloat(p.teg_reale)   || 0,
        soglia:            parseFloat(p.soglia_usura) || 0,
        score:             parseInt(p.score_finale)   || 0,
        label:             ['Nessuna anomalia','Zona grigia','Anomalia possibile','Anomalia probabile','Caso forte per contenzioso'][parseInt(p.score_finale)||0] || '',
        affidabilita:      parseInt(p.score_finale) <= 1 ? 'alta' : parseInt(p.score_finale) <= 2 ? 'media' : 'bassa',
        usura_rilevata:    p.usura_rilevata,
        delta_pp:          p.teg_reale && p.soglia_usura ? parseFloat(((p.teg_reale - p.soglia_usura)*100).toFixed(2)) : null,
        fattori:           fattoriParsed,
        anatocismo:        anatocismoParsed,
        orientamento_giurisp: null
      };
      AppState.costi = p.voci_json ? JSON.parse(p.voci_json) : [];

      // Naviga a Step 3 e mostra risultati
      document.querySelectorAll('.step').forEach(el => el.classList.remove('active'));
      const s3 = document.getElementById('step-3');
      if (s3) { s3.classList.add('active'); AppState.step = 3; }
      app.showResults(AppState.ultimaAnalisi);

    } catch (err) {
      alert('❌ Errore apertura pratica: ' + err.message);
    }
  },

  exportCSVArchivio: async () => {
    try {
      const r = await window.electronAPI.invoke('export-csv');
      if (r.successo) alert('✅ CSV salvato:\n' + r.path_file);
      else alert('❌ ' + r.errore);
    } catch (err) {
      alert('❌ ' + err.message);
    }
  },

  eliminaPratica: async (analisiId) => {
    if (!confirm(`Eliminare definitivamente la pratica ${analisiId.substring(0,20)}…?\nL'operazione non è reversibile.`)) return;
    try {
      const result = await window.electronAPI.invoke('elimina-analisi', analisiId);
      if (!result.successo) throw new Error(result.errore);
      // Rimuovi la riga dalla tabella senza ricaricare tutto
      const row = document.getElementById('row-' + analisiId);
      if (row) {
        row.style.transition = 'opacity 0.3s';
        row.style.opacity = '0';
        setTimeout(() => row.remove(), 300);
      }
      // Aggiorna contatore
      const p = document.querySelector('#step-archivio p');
      if (p) {
        const rows = document.querySelectorAll('#step-archivio tbody tr').length - 1;
        p.textContent = `${rows} pratich${rows===1?'a':'e'} trovata${rows===1?'':'e'} — clicca una riga per riaprirla`;
      }
    } catch (err) {
      alert('❌ Errore eliminazione: ' + err.message);
    }
  },

  // Reset completo form per nuova pratica
  resetForm: () => {
    // Reset stato globale
    AppState.step      = 1;
    AppState.contratto = {};
    AppState.costi     = [];
    AppState.ultimaAnalisi = null;

    // Reset campi Step 1
    const fields = ['tipo', 'data', 'capitale', 'tan', 'durata'];
    fields.forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      if (el.tagName === 'SELECT') el.selectedIndex = 0;
      else el.value = '';
    });

    // Reset feedback parser
    const msgEl = document.getElementById('parser-msg');
    if (msgEl) msgEl.innerText = '';

    // Reset pulsante carica (nel caso fosse rimasto disabilitato)
    const btnEl = document.getElementById('btn-carica-doc');
    if (btnEl) { btnEl.disabled = false; btnEl.innerText = '📄 Carica Documento'; }

    // Reset Step 3 risultati
    ['res-tan','res-teg','res-soglia','res-score','res-delta'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.innerText = '-';
    });
    const fl = document.getElementById('factors-list');
    if (fl) fl.innerHTML = '';

    // Nascondi sezione anatocismo se presente
    const anatEl = document.getElementById('anatocismo-section');
    if (anatEl) { anatEl.innerHTML = ''; anatEl.style.display = 'none'; }

    // Vai a Step 1
    document.querySelectorAll('.step').forEach(el => el.classList.remove('active'));
    const s1 = document.getElementById('step-1');
    if (s1) s1.classList.add('active');

    // Re-render lista costi (vuota)
    app.renderCosts();

    console.log('✅ Form resettato per nuova pratica');
  },

  // ── SETTINGS — Parser LLM (Sessione E) ────────────────────────────────────
  loadSettings: async () => {
    console.log('⚙️ Carico Impostazioni');

    // Legge config LLM corrente (il renderer vede solo provider + flag key presente)
    let cfgCorrente = { provider: 'claude', api_key_presente: false };
    try {
      const r = await window.electronAPI.getConfigLLM();
      if (r.successo) cfgCorrente = r.dati;
    } catch (_) {}

    const main = document.getElementById('main-content') || document.body;

    // Rimuovi settings panel precedente se esiste
    const oldPanel = document.getElementById('settings-panel');
    if (oldPanel) oldPanel.remove();

    const panel = document.createElement('div');
    panel.id = 'settings-panel';
    panel.style.cssText = `
      position:fixed; top:0; left:0; width:100%; height:100%;
      background:rgba(0,0,0,0.85); display:flex; align-items:center;
      justify-content:center; z-index:9999;
    `;

    panel.innerHTML = `
      <div style="background:#1a1a1a; border:2px solid #c9a227; border-radius:8px;
                  padding:30px; max-width:480px; width:90%; color:#fff;">

        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
          <h2 style="color:#c9a227; margin:0; font-size:18px;">⚙️ Impostazioni — Parser LLM</h2>
          <button id="btn-close-settings" style="background:none; border:none; color:#888;
                  font-size:22px; cursor:pointer; line-height:1;">✕</button>
        </div>

        <p style="color:#aaa; font-size:13px; margin-bottom:20px; line-height:1.5;">
          Configura l'intelligenza artificiale per estrarre automaticamente i dati
          dai contratti bancari (PDF o immagine) nel Step 1.
        </p>

        <!-- Provider -->
        <div style="margin-bottom:18px;">
          <label style="display:block; color:#c9a227; font-size:13px; margin-bottom:6px; font-weight:bold;">
            Provider LLM
          </label>
          <select id="settings-provider" style="width:100%; padding:10px; background:#222;
                  border:1px solid #444; color:#fff; font-size:14px; border-radius:4px;">
            <option value="claude" ${cfgCorrente.provider === 'claude' ? 'selected' : ''}>
              Claude (Anthropic) — Consigliato
            </option>
            <option value="openai" ${cfgCorrente.provider === 'openai' ? 'selected' : ''}>
              GPT-4o (OpenAI)
            </option>
          </select>
        </div>

        <!-- API Key -->
        <div style="margin-bottom:8px;">
          <label style="display:block; color:#c9a227; font-size:13px; margin-bottom:6px; font-weight:bold;">
            API Key
          </label>
          <input type="password" id="settings-apikey" placeholder="${cfgCorrente.api_key_presente ? '••••••••••••••••  (già configurata)' : 'Incolla qui la tua API key'}"
                 style="width:100%; padding:10px; background:#222; border:1px solid #444;
                        color:#fff; font-size:14px; border-radius:4px; box-sizing:border-box;">
        </div>
        <p style="color:#666; font-size:11px; margin-bottom:20px;">
          🔒 La key viene salvata localmente nel DB. Non viene mai trasmessa al renderer.
          ${cfgCorrente.api_key_presente ? '<br>✅ API key già presente — lascia vuoto per mantenerla.' : ''}
        </p>

        <!-- Link documentazione -->
        <p style="color:#555; font-size:11px; margin-bottom:20px;">
          Claude key → <a href="https://console.anthropic.com" style="color:#c9a227;">console.anthropic.com</a>
          &nbsp;|&nbsp;
          OpenAI key → <a href="https://platform.openai.com/api-keys" style="color:#c9a227;">platform.openai.com</a>
        </p>

        <!-- Bottoni -->
        <div style="display:flex; gap:10px; justify-content:flex-end;">
          <button id="btn-cancel-settings" style="padding:10px 20px; background:#333;
                  color:#fff; border:none; cursor:pointer; border-radius:4px;">
            Annulla
          </button>
          <button id="btn-save-settings" style="padding:10px 24px; background:#c9a227;
                  color:#000; border:none; cursor:pointer; font-weight:bold; border-radius:4px;">
            💾 Salva
          </button>
        </div>

        <div id="settings-msg" style="margin-top:12px; font-size:13px; min-height:18px;"></div>
      </div>
    `;

    document.body.appendChild(panel);

    const chiudi = () => panel.remove();

    document.getElementById('btn-close-settings').onclick   = chiudi;
    document.getElementById('btn-cancel-settings').onclick  = chiudi;

    document.getElementById('btn-save-settings').onclick = async () => {
      const provider = document.getElementById('settings-provider').value;
      const api_key  = document.getElementById('settings-apikey').value.trim();
      const msgEl    = document.getElementById('settings-msg');

      // Se il campo è vuoto e la key era già presente, non sovrascrivere
      const payload = { provider };
      if (api_key !== '') payload.api_key = api_key;

      try {
        msgEl.style.color = '#aaa';
        msgEl.innerText = '⏳ Salvataggio in corso...';

        const r = await window.electronAPI.salvaConfigLLM(payload);
        if (r.successo) {
          msgEl.style.color = '#4caf50';
          msgEl.innerText   = '✅ Configurazione salvata correttamente.';
          setTimeout(chiudi, 1200);
        } else {
          msgEl.style.color = '#ff4d4d';
          msgEl.innerText   = '❌ ' + r.errore;
        }
      } catch (err) {
        msgEl.style.color = '#ff4d4d';
        msgEl.innerText   = '❌ ' + err.message;
      }
    };
  },

  // ── CARICA DOCUMENTO (Sessione E) ─────────────────────────────────────────
  caricaDocumentoParser: async () => {
    // Stato feedback visivo
    const btnEl = document.getElementById('btn-carica-doc');
    const msgEl = document.getElementById('parser-msg');
    if (msgEl) { msgEl.style.color = '#aaa'; msgEl.innerText = '⏳ Selezione file...'; }

    try {
      // 1. Apri dialog nativo nel main process
      const dialogResult = await window.electronAPI.apriDialogFile();
      if (!dialogResult.successo) {
        if (msgEl) msgEl.innerText = '';
        return;
      }

      if (btnEl) { btnEl.disabled = true; btnEl.innerText = '⏳ Analisi in corso...'; }
      if (msgEl) { msgEl.style.color = '#c9a227'; msgEl.innerText = '🤖 LLM in elaborazione, attendere...'; }

      // 2. Chiama parser LLM nel main process
      const risultato = await window.electronAPI.caricaDocumento(dialogResult.filePath);

      if (btnEl) { btnEl.disabled = false; btnEl.innerText = '📄 Carica Documento'; }

      if (!risultato.successo) {
        const errMsg = risultato.meta?.errore_llm || risultato.errore || 'Errore sconosciuto';

        // Errore API key non configurata → apri settings
        if (errMsg.toLowerCase().includes('api key') || errMsg.toLowerCase().includes('impostazioni')) {
          if (msgEl) {
            msgEl.style.color = '#ff9800';
            msgEl.innerHTML   = `⚠️ ${errMsg} &nbsp;<button onclick="app.loadSettings()" style="color:#c9a227;background:none;border:none;cursor:pointer;font-size:12px;text-decoration:underline;">→ Apri Impostazioni</button>`;
          }
        } else {
          if (msgEl) { msgEl.style.color = '#ff4d4d'; msgEl.innerText = '❌ ' + errMsg; }
        }
        return;
      }

      // 3. Pre-compila i campi del form Step 1
      const d = risultato.dati_form;
      let compilati = 0;

      if (d.tipo_contratto) {
        const sel = document.getElementById('tipo');
        if (sel) { sel.value = d.tipo_contratto; compilati++; }
      }
      if (d.data_stipula) {
        const inp = document.getElementById('data');
        if (inp) { inp.value = d.data_stipula; compilati++; }
      }
      if (d.capitale !== null) {
        const inp = document.getElementById('capitale');
        if (inp) { inp.value = d.capitale; compilati++; }
      }
      if (d.tan !== null) {
        const inp = document.getElementById('tan');
        if (inp) { inp.value = d.tan; compilati++; }
      }
      if (d.durata_mesi !== null) {
        // Prova a trovare il campo durata (esiste in alcune versioni del form)
        const inp = document.getElementById('durata');
        if (inp) { inp.value = d.durata_mesi; compilati++; }
        AppState.contratto.durata_mesi = d.durata_mesi;
      }

      // 4. Aggiungi voci di costo estratte (se non già presenti)
      if (d.voci_costo && d.voci_costo.length > 0) {
        d.voci_costo.forEach(v => {
          const esiste = AppState.costi.find(c => c.voce.toLowerCase() === v.voce.toLowerCase());
          if (!esiste) {
            AppState.costi.push({ id: Date.now() + Math.random(), voce: v.voce, importo: v.importo, inclusa: true });
          }
        });
        app.renderCosts();
      }

      // 5. Feedback successo
      const meta     = risultato.meta || {};
      const noteText = d.note_parser ? ` — Note: ${d.note_parser}` : '';
      const warnText = meta.errore_caricamento ? ` (⚠️ ${meta.errore_caricamento})` : '';

      if (msgEl) {
        msgEl.style.color = '#4caf50';
        msgEl.innerText = `✅ ${compilati} campi compilati da "${meta.nome_file}" (${meta.pagine} pag., ${meta.provider_usato})${noteText}${warnText}`;
      }

    } catch (err) {
      if (btnEl) { btnEl.disabled = false; btnEl.innerText = '📄 Carica Documento'; }
      if (msgEl) { msgEl.style.color = '#ff4d4d'; msgEl.innerText = '❌ ' + err.message; }
      console.error('❌ caricaDocumentoParser:', err);
    }
  }
};

// ── Widget Tassi di Riferimento ────────────────────────────────────────────
async function aggiornaWidgetMercato() {
  try {
    const r = await window.electronAPI.invoke('get-market-data');
    if (!r || !r.successo) return;
    const d = r.dati;

    const set = (id, val) => { const el = document.getElementById(id); if (el) el.innerText = val; };

    set('euribor-val',    d.euribor_3m    != null ? d.euribor_3m.toFixed(3) + '%'    : '--%');
    set('euribor-periodo',d.euribor_periodo ? '(' + d.euribor_periodo + ' · ' + (d.euribor_fonte||'') + ')' : '');
    set('tegm-val',       d.tegm_corrente  != null ? d.tegm_corrente.toFixed(2) + '%'  : '--%');
    set('tegm-periodo',   d.tegm_periodo   ? '(' + d.tegm_periodo + ' · ' + (d.tegm_fonte||'') + ')' : '');
    set('soglia-val',     d.soglia_corrente != null ? d.soglia_corrente.toFixed(4) + '%' : '--%');

    // Timestamp ultimo aggiornamento
    if (d.timestamp) {
      const dt = new Date(d.timestamp);
      const ora = dt.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
      const gg  = dt.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' });
      set('widget-aggiornato', d.fromCache ? '' : '↻ aggiornato ' + gg + ' ' + ora);
    }
  } catch (err) {
    console.warn('Widget mercato:', err.message);
  }
}

// Esponi sul namespace app
window.app = window.app || {};
Object.assign(window.app, { aggiornaWidgetMercato });

document.addEventListener('DOMContentLoaded', () => {
  console.log('✅ BBRE UI pronta.');
  app.renderCosts();
  app.aggiornaWidgetMercato();
  // Aggiorna ogni 5 minuti
  setInterval(app.aggiornaWidgetMercato, 5 * 60 * 1000);
});