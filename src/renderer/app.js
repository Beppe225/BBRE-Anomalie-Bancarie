// App State Globale
const state = {
  step: 1,
  contratto: {},
  costi: []
};

window.appState = state;

window.app = {
  nav: (page) => {
    if (page === 'nuova') app.goToStep(1);
    if (page === 'archivio') {
      app.loadArchive();
      document.querySelectorAll('.step').forEach(el => el.classList.remove('active'));
      document.getElementById('step-archivio').classList.add('active');
    }
    if (page === 'impostazioni') {
      app.loadSettings();
      document.querySelectorAll('.step').forEach(el => el.classList.remove('active'));
      document.getElementById('step-impostazioni').classList.add('active');
    }
  },

  goToStep: (target) => {
    if (state.step === 1 && target === 2) {
      const form = document.getElementById('form-contratto');
      if (!form.checkValidity()) {
        alert('Compila tutti i campi obbligatori!');
        form.reportValidity();
        return;
      }
      
      state.contratto = {
        contratto_id: 'BBRE-' + Date.now(),
        tipo_contratto: document.getElementById('tipo').value,
        data_stipula: document.getElementById('data').value,
        capitale: parseFloat(document.getElementById('capitale').value),
        tan_dichiarato: parseFloat(document.getElementById('tan').value) / 100
      };
    }

    document.querySelectorAll('.step').forEach(el => el.classList.remove('active'));
    document.getElementById('step-' + target).classList.add('active');
    state.step = target;
  },

  addCost: (type) => {
    const container = document.createElement('div');
    container.className = 'cost-input-modal';
    container.innerHTML = `
      <div style="position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.8);display:flex;align-items:center;justify-content:center;z-index:9999;">
        <div style="background:#1e1e1e;padding:30px;border-radius:8px;border:2px solid #c9a227;max-width:400px;width:90%;">
          <h3 style="margin-top:0;color:#c9a227;">Aggiungi ${type}</h3>
          <input type="number" id="temp-cost-amount" step="0.01" placeholder="Importo in €" style="width:100%;padding:12px;margin:15px 0;background:#222;border:1px solid #333;color:white;font-size:18px;" autofocus>
          <div style="display:flex;gap:10px;justify-content:flex-end;">
            <button id="btn-cancel" style="padding:10px 20px;background:#333;color:white;border:none;cursor:pointer;border-radius:4px;">Annulla</button>
            <button id="btn-confirm" style="padding:10px 20px;background:#c9a227;color:#000;border:none;cursor:pointer;border-radius:4px;font-weight:bold;">Conferma</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(container);
    const input = document.getElementById('temp-cost-amount');
    input.focus();
    
    const close = () => container.remove();
    const confirm = () => {
      const amount = parseFloat(input.value);
      if (isNaN(amount) || amount <= 0) {
        alert('Inserisci un importo valido!');
        input.focus();
        return;
      }
      state.costi.push({ voce: type, importo: amount, tipologia: 'spesa', inclusa: true });
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
    if (state.costi.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:#888;padding:20px;">Nessuna voce di costo inserita</td></tr>';
      return;
    }
    const totale = state.costi.reduce((sum, c) => sum + c.importo, 0);
    state.costi.forEach((c, i) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="padding:10px;">${c.voce}</td>
        <td style="padding:10px;">€ ${c.importo.toFixed(2)}</td>
        <td style="padding:10px;"><input type="checkbox" ${c.inclusa ? 'checked' : ''} onclick="app.toggleCost(${i})"></td>
        <td style="padding:10px;"><button onclick="app.removeCost(${i})" style="background:#ff4d4d;color:white;border:none;padding:5px 10px;cursor:pointer;border-radius:3px;">✕</button></td>
      `;
      tbody.appendChild(tr);
    });
    const trTotale = document.createElement('tr');
    trTotale.style.fontWeight = 'bold';
    trTotale.style.background = '#1e1e1e';
    trTotale.innerHTML = `
      <td colspan="3" style="text-align:right;padding:10px;">TOTALE:</td>
      <td style="padding:10px;color:#c9a227;">€ ${totale.toFixed(2)}</td>
    `;
    tbody.appendChild(trTotale);
  },

  toggleCost: (idx) => { state.costi[idx].inclusa = !state.costi[idx].inclusa; },
  removeCost: (idx) => { state.costi.splice(idx, 1); app.renderCosts(); },

  runAnalysis: async () => {
    if (state.costi.length === 0) {
      alert('Aggiungi almeno una voce di costo!');
      return;
    }
    const btn = document.getElementById('btn-run');
    const originalText = btn.innerText;
    btn.innerText = 'Calcolo in corso...';
    btn.disabled = true;

    try {
      const payload = {
        ...state.contratto,
        voci: state.costi.map(c => ({ voce: c.voce, importo: c.importo, tipologia: c.tipologia, inclusa_teg: c.inclusa }))
      };
      const result = await window.electronAPI.invoke('esegui-analisi', payload);
      if (result.successo) {
        app.showResults(result.dati);
        app.goToStep(3);
      } else {
        alert('Errore Analisi: ' + result.errore);
      }
    } catch (err) {
      console.error('Errore IPC:', err);
      alert('Errore di comunicazione: ' + err.message);
    } finally {
      btn.innerText = originalText;
      btn.disabled = false;
    }
  },

  showResults: (data) => {
    console.log('📊 Risultati:', data);
    
    const scoreEl = document.getElementById('score-val');
    if (scoreEl) {
      scoreEl.innerText = data.score;
      scoreEl.style.borderColor = data.score >= 3 ? '#ff4d4d' : (data.score <= 1 ? '#4caf50' : '#c9a227');
    }

    document.getElementById('res-tan').innerText = (state.contratto.tan_dichiarato * 100).toFixed(2) + '%';
    document.getElementById('res-teg').innerText = (data.teg * 100).toFixed(4) + '%';
    document.getElementById('res-soglia').innerText = (data.soglia || 0).toFixed(4) + '%';

    const tbody = document.getElementById('factors-list');
    if (tbody) {
      tbody.innerHTML = '';
      if (data.fattori && data.fattori.length > 0) {
        data.fattori.forEach(f => {
          tbody.innerHTML += `
            <tr>
              <td style="padding:8px;">${f.id}</td>
              <td style="padding:8px;">${f.nome}</td>
              <td style="padding:8px;">${(f.valore * 100).toFixed(1)}%</td>
              <td style="padding:8px;">${(f.peso * 100).toFixed(0)}%</td>
            </tr>`;
        });
      } else {
        tbody.innerHTML = '<tr><td colspan="4" style="padding:20px;text-align:center;">Nessun fattore disponibile</td></tr>';
      }
    }
  },

  generatePDF: async () => {
    try {
      const btn = document.querySelector('#step-3 .btn-primary');
      const originalText = btn.innerText;
      btn.innerText = 'Salvataggio...';
      btn.disabled = true;

      const datiCompleti = {
        ...state.contratto,
        voci: state.costi.map(c => ({ 
          voce: c.voce, 
          importo: c.importo, 
          inclusa_teg: c.inclusa,
          motivazione: c.inclusa ? 'Inclusa nel calcolo TEG' : 'Esclusa per normativa'
        })),
        teg: parseFloat((document.getElementById('res-teg').innerText.replace('%','')))/100 || 0,
        soglia: parseFloat((document.getElementById('res-soglia').innerText.replace('%','')))/100 || 0,
        score: parseInt(document.getElementById('score-val').innerText) || 0,
        fattori: Array.from(document.querySelectorAll('#factors-list tr')).map(row => ({
          id: row.cells[0].innerText,
          nome: row.cells[1].innerText,
          valore: parseFloat(row.cells[2].innerText.replace('%',''))/100,
          peso: parseFloat(row.cells[3].innerText.replace('%',''))/100
        }))
      };

      const result = await window.electronAPI.invoke('salva-pdf-dialog', datiCompleti);

      if (result.successo) {
        alert('✅ Report salvato con successo!\n\nPercorso: ' + result.path);
      } else if (result.messaggio) {
        console.log('Salvataggio annullato');
      } else {
        alert('❌ Errore PDF: ' + result.errore);
      }
    } catch (e) {
      console.error(e);
      alert('❌ Errore di sistema: ' + e.message);
    } finally {
      const btn = document.querySelector('#step-3 .btn-primary');
      if(btn) {
        btn.innerText = 'Scarica Report PDF';
        btn.disabled = false;
      }
    }
  },

  loadArchive: async () => {
    const tbody = document.getElementById('archive-list');
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">Caricamento...</td></tr>';
    
    try {
      const response = await window.electronAPI.invoke('get-analisi-list');
      
      if (!response.successo || !response.dati || response.dati.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:#888;">Nessuna pratica salvata.</td></tr>';
        return;
      }

      tbody.innerHTML = '';
      response.dati.forEach(item => {
        const scoreColor = item.score <= 1 ? '#4caf50' : (item.score <= 2 ? '#c9a227' : '#ff4d4d');
        const date = new Date(item.timestamp_analisi).toLocaleDateString('it-IT');
        
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td style="font-family:monospace; font-size:11px;">${item.analisi_id.substring(0, 8)}...</td>
          <td>${date}</td>
          <td><span style="background:${scoreColor}; color:white; padding:2px 6px; border-radius:4px; font-weight:bold;">${item.score}</span></td>
          <td>${(item.teg * 100).toFixed(2)}%</td>
          <td>${(item.soglia * 100).toFixed(2)}%</td>
          <td>
            <button onclick="app.deleteArchiveEntry('${item.analisi_id}', this)" style="background:#ff4d4d; color:white; border:none; padding:4px 8px; cursor:pointer;border-radius:3px;">🗑️</button>
          </td>
        `;
        tbody.appendChild(tr);
      });
    } catch (e) {
      console.error(e);
      tbody.innerHTML = '<tr><td colspan="6" style="color:red;">Errore nel caricamento</td></tr>';
    }
  },

  deleteArchiveEntry: async (id, btnElement) => {
    if (!confirm(`Sei sicuro di voler eliminare la pratica ${id.substring(0, 8)}...?`)) return;
    
    try {
      const res = await window.electronAPI.invoke('delete-analisi', id);
      if (res.successo) {
        btnElement.closest('tr').remove();
      } else {
        alert('Errore: ' + res.errore);
      }
    } catch (e) {
      alert('Errore di connessione');
    }
  },

  loadSettings: async () => {
    try {
      const info = await window.electronAPI.invoke('get-system-info');
      if (info.successo) {
        document.getElementById('sys-version').innerText = info.appVersion;
        document.getElementById('sys-db-path').innerText = info.dbPath;
        
        const lastUpdate = info.config['ultimo_update_soglie'] || 'Mai';
        document.getElementById('sys-soglie-update').innerText = new Date(lastUpdate).toLocaleDateString('it-IT');
      }
    } catch (e) {
      console.error(e);
    }
  },
  
  exportCSV: () => {
    alert('Funzione Export CSV: I dati verranno scaricati in formato CSV. (In sviluppo)');
  },

  backupDB: async () => {
    try {
      const result = await window.electronAPI.invoke('backup-db');
      if (result.successo) {
        alert('✅ Backup creato con successo!\n\nPercorso: ' + result.path);
      } else if (result.messaggio) {
        console.log('Backup annullato');
      } else {
        alert('❌ Errore Backup: ' + result.errore);
      }
    } catch (e) {
      alert('❌ Errore di sistema: ' + e.message);
    }
  }
};

document.addEventListener('DOMContentLoaded', () => { 
  console.log('✅ BBRE UI pronta.'); 
});
