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
  },

  generatePDF: async () => {
    try {
      const result = await window.electronAPI.invoke('genera-report', {
        ...AppState.contratto,
        ...AppState.ultimaAnalisi
      });
      if (result.successo) {
        alert('✅ Report PDF salvato in:\n' + result.path_file);
      } else {
        alert('❌ Errore PDF: ' + result.errore);
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