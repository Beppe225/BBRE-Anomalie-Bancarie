/**
 * BBRE Market Widget
 * Gestisce la visualizzazione nella sidebar destra
 */
const MarketWidget = {
  intervalId: null,
  
  init() {
    console.log('📈 Inizializzazione Market Widget...');
    this.renderLoading();
    this.update(); // Primo caricamento
    
    // Auto-refresh ogni 60 secondi
    this.intervalId = setInterval(() => this.update(), 60000);
  },

  async update() {
    try {
      const response = await window.electronAPI.invoke('get-market-data');
      if (response.successo) {
        this.renderData(response.dati);
      } else {
        this.renderError(response.errore);
      }
    } catch (e) {
      this.renderError('Connessione IPC fallita');
    }
  },

  renderLoading() {
    const widget = document.getElementById('market-widget');
    if (widget) {
      widget.innerHTML = `
        <h4 style="margin-top:0; color:#c9a227;">📈 Mercato (Indicativo)</h4>
        <p style="color:#888;">Caricamento dati...</p>
        <span class="badge-warning" style="font-size:10px; color:#ff4d4d;">! DATI NON VALIDI PER PERIZIA</span>
      `;
    }
  },

  renderError(msg) {
    const widget = document.getElementById('market-widget');
    if (widget) {
      widget.innerHTML = `
        <h4 style="margin-top:0; color:#ff4d4d;">⚠️ Errore Mercato</h4>
        <p style="color:#888; font-size:12px;">${msg}</p>
        <p style="font-size:10px; color:#888;">Modalità offline attiva.</p>
        <button onclick="MarketWidget.update()" style="background:#333; color:#fff; border:none; padding:5px; cursor:pointer; width:100%;">Riprova</button>
        <span class="badge-warning" style="display:block; margin-top:10px; font-size:10px; color:#ff4d4d;">! DATI NON VALIDI PER PERIZIA</span>
      `;
    }
  },

  renderData(data) {
    const widget = document.getElementById('market-widget');
    if (!widget) return;

    // Formattazione date
    const lastUpdate = new Date(data.timestamp).toLocaleTimeString('it-IT');

    // Controllo variazione (simulato per feedback visivo)
    const trendIcon = Math.random() > 0.5 ? '📈' : '📉'; 

    widget.innerHTML = `
      <div style="border-bottom:1px solid #333; padding-bottom:5px; margin-bottom:10px; display:flex; justify-content:space-between;">
        <h4 style="margin:0; color:#c9a227;">📈 Tassi di Riferimento</h4>
        <span style="font-size:10px; color:#888;">${data.fromCache ? 'Cache' : 'Live'}</span>
      </div>
      
      <div style="margin-bottom:10px;">
        <div style="font-size:11px; color:#888;">EURIBOR 3 Mesi</div>
        <div style="font-size:16px; font-weight:bold; color:white;">${data.euribor_3m.toFixed(3)}%</div>
      </div>

      <div style="margin-bottom:10px;">
        <div style="font-size:11px; color:#888;">TEGM Medio (Mutui)</div>
        <div style="font-size:16px; font-weight:bold; color:white;">${data.tegm_corrente.toFixed(2)}%</div>
      </div>

      <div style="font-size:10px; color:#4caf50; margin-bottom:10px;">
        ✅ Ultimo aggiornamento: ${lastUpdate}
      </div>

      <div style="background:#1a1a1a; padding:8px; border-radius:4px; border:1px solid #ff4d4d;">
        <p style="margin:0; font-size:9px; color:#ff4d4d; font-weight:bold; text-transform:uppercase;">
          ⚠️ ATTENZIONE<br>
          Dati indicativi.<br>
          Non validi per perizia legale.
        </p>
      </div>
    `;
  }
};

// Espone globalmente per i bottoni HTML
window.MarketWidget = MarketWidget;

// Avvio automatico quando il DOM è pronto
document.addEventListener('DOMContentLoaded', () => {
  MarketWidget.init();
});
