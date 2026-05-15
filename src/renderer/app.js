// Stato Globale
const AppState = {
  step: 1,
  contratto: {},
  costi: []
};

// Funzioni esposte al renderer
window.app = {
  nav: (page) => {
    if (page === 'nuova') app.goToStep(1);
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

  loadArchive: () => { console.log('📂 Carico Archivio'); },
  loadSettings: () => { console.log('⚙️ Carico Impostazioni'); }
};

document.addEventListener('DOMContentLoaded', () => {
  console.log('✅ BBRE UI pronta.');
  app.renderCosts();
});