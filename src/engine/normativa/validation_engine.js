/**
 * validation_engine.js — Sessione J: Validazione Input Avanzata
 * 
 * Valida i dati del contratto PRIMA dell'analisi e restituisce
 * un array di warning/errori con severità e suggerimenti.
 * 
 * Severità:
 *   - 'errore'   → blocca l'analisi
 *   - 'warning'  → mostra avviso ma permette di procedere
 *   - 'info'     → suggerimento neutro
 */

// Ranges storici plausibili per tipo contratto
const RANGES = {
  mutuo_ipotecario: {
    tan_min: 0.1, tan_max: 25,
    capitale_min: 10000, capitale_max: 5000000,
    durata_min: 12, durata_max: 480,
    tan_warn_alto: 10, tan_warn_basso: 0.5
  },
  cqs: {
    tan_min: 0.5, tan_max: 35,
    capitale_min: 1000, capitale_max: 150000,
    durata_min: 12, durata_max: 120,
    tan_warn_alto: 20, tan_warn_basso: 2
  },
  credito_consumo: {
    tan_min: 0.5, tan_max: 40,
    capitale_min: 500, capitale_max: 75000,
    durata_min: 6, durata_max: 120,
    tan_warn_alto: 25, tan_warn_basso: 1
  }
};

// Soglie usura approssimative per alert rapido (non sostituisce il calcolo esatto)
const SOGLIE_APPROSSIMATIVE = {
  mutuo_ipotecario: { ante_2011: 7.5, post_2011: 8.0 },
  cqs:              { ante_2011: 15,  post_2011: 14.5 },
  credito_consumo:  { ante_2011: 18,  post_2011: 16.5 }
};

/**
 * Valida i dati Step 1 del contratto.
 * @param {object} dati - { tipo_contratto, data_stipula, capitale, tan_dichiarato, durata_mesi }
 * @returns {{ valido: boolean, errori: [], warnings: [], info: [] }}
 */
function valida_contratto(dati) {
  const { tipo_contratto, data_stipula, capitale, tan_dichiarato, durata_mesi } = dati;
  
  const errori   = [];
  const warnings = [];
  const info     = [];

  // ── Tipo contratto ────────────────────────────────────────────────────────
  const tipi_validi = ['mutuo_ipotecario', 'cqs', 'credito_consumo'];
  if (!tipo_contratto || !tipi_validi.includes(tipo_contratto)) {
    errori.push({ campo: 'tipo', msg: 'Tipologia contratto non valida.' });
  }

  // ── Data stipula ──────────────────────────────────────────────────────────
  if (!data_stipula) {
    errori.push({ campo: 'data', msg: 'Data stipula obbligatoria.' });
  } else {
    const d = new Date(data_stipula);
    const oggi = new Date();
    const annoMin = 2000;
    const anno = d.getFullYear();
    
    if (isNaN(d.getTime())) {
      errori.push({ campo: 'data', msg: 'Data stipula non valida.' });
    } else if (anno < annoMin) {
      warnings.push({ campo: 'data', msg: `Data stipula ${anno}: molto datata. Verifica la copertura delle soglie usura storiche.` });
    } else if (d > oggi) {
      errori.push({ campo: 'data', msg: 'Data stipula nel futuro: non possibile.' });
    } else if ((oggi - d) / (1000 * 3600 * 24) < 30) {
      info.push({ campo: 'data', msg: 'Contratto molto recente — le soglie usura potrebbero non essere ancora aggiornate.' });
    }
  }

  // ── Capitale ──────────────────────────────────────────────────────────────
  const capNum = parseFloat(capitale);
  if (isNaN(capNum) || capNum <= 0) {
    errori.push({ campo: 'capitale', msg: 'Capitale non valido: deve essere > 0.' });
  } else if (tipo_contratto && RANGES[tipo_contratto]) {
    const r = RANGES[tipo_contratto];
    if (capNum < r.capitale_min) {
      warnings.push({ campo: 'capitale', msg: `Capitale €${capNum.toLocaleString('it-IT')} molto basso per ${_labelTipo(tipo_contratto)}. Minimo tipico: €${r.capitale_min.toLocaleString('it-IT')}.` });
    } else if (capNum > r.capitale_max) {
      warnings.push({ campo: 'capitale', msg: `Capitale €${capNum.toLocaleString('it-IT')} molto alto per ${_labelTipo(tipo_contratto)}. Massimo tipico: €${r.capitale_max.toLocaleString('it-IT')}.` });
    }
  }

  // ── TAN ───────────────────────────────────────────────────────────────────
  const tanNum = parseFloat(tan_dichiarato); // in % (es. 7.5)
  if (isNaN(tanNum) || tanNum < 0) {
    errori.push({ campo: 'tan', msg: 'TAN non valido: deve essere ≥ 0.' });
  } else if (tanNum === 0) {
    info.push({ campo: 'tan', msg: 'TAN = 0%: finanziamento infruttifero. Verifica la tipologia.' });
  } else if (tipo_contratto && RANGES[tipo_contratto]) {
    const r = RANGES[tipo_contratto];
    if (tanNum < r.tan_min) {
      warnings.push({ campo: 'tan', msg: `TAN ${tanNum}% insolitamente basso per ${_labelTipo(tipo_contratto)}.` });
    } else if (tanNum > r.tan_max) {
      errori.push({ campo: 'tan', msg: `TAN ${tanNum}% supera il massimo ammissibile (${r.tan_max}%) per ${_labelTipo(tipo_contratto)}: improbabile.` });
    } else if (tanNum > r.tan_warn_alto) {
      warnings.push({ campo: 'tan', msg: `TAN ${tanNum}% elevato per ${_labelTipo(tipo_contratto)}. Possibile zona usura — verifica le soglie.` });
    } else if (tanNum < r.tan_warn_basso) {
      info.push({ campo: 'tan', msg: `TAN ${tanNum}% molto basso — verifica che sia corretto.` });
    }

    // Alert rapido pre-analisi se già visibilmente sopra la soglia
    if (data_stipula && tanNum > 0) {
      const anno = parseInt((data_stipula || '').substring(0, 4));
      const soglie_approx = SOGLIE_APPROSSIMATIVE[tipo_contratto];
      if (soglie_approx) {
        const soglia_approx = anno < 2011 ? soglie_approx.ante_2011 : soglie_approx.post_2011;
        if (tanNum > soglia_approx * 1.2) { // 20% sopra soglia approx → alert pre-analisi
          warnings.push({
            campo: 'tan',
            msg: `⚠️ TAN ${tanNum}% potenzialmente vicino o sopra soglia usura (~${soglia_approx.toFixed(1)}% per ${_labelTipo(tipo_contratto)} ${anno < 2011 ? 'ante-2011' : 'post-2011'}). Analisi consigliata urgentemente.`,
            highlight: true
          });
        }
      }
    }
  }

  // ── Durata ────────────────────────────────────────────────────────────────
  const durataNum = parseInt(durata_mesi) || 84;
  if (tipo_contratto && RANGES[tipo_contratto]) {
    const r = RANGES[tipo_contratto];
    if (durataNum < r.durata_min) {
      warnings.push({ campo: 'durata', msg: `Durata ${durataNum} mesi molto breve per ${_labelTipo(tipo_contratto)}.` });
    } else if (durataNum > r.durata_max) {
      warnings.push({ campo: 'durata', msg: `Durata ${durataNum} mesi (${(durataNum/12).toFixed(1)} anni) molto lunga per ${_labelTipo(tipo_contratto)}.` });
    }
  }

  // ── Coerenza TAN/durata ───────────────────────────────────────────────────
  if (!isNaN(tanNum) && !isNaN(durataNum) && tanNum > 0 && durataNum > 0) {
    const costoTotaleApprox = (capNum * (tanNum/100) * durataNum / 12);
    const rapportoInteressiCapitale = costoTotaleApprox / capNum;
    if (rapportoInteressiCapitale > 1.5) {
      info.push({
        campo: 'coerenza',
        msg: `Interessi totali stimati: ~€${costoTotaleApprox.toFixed(0)} (${(rapportoInteressiCapitale*100).toFixed(0)}% del capitale). Verifica durata e TAN.`
      });
    }
  }

  return {
    valido:   errori.length === 0,
    errori,
    warnings,
    info,
    totale_anomalie: errori.length + warnings.length
  };
}

function _labelTipo(tipo) {
  const map = { mutuo_ipotecario: 'Mutuo Ipotecario', cqs: 'CQS', credito_consumo: 'Credito Consumo' };
  return map[tipo] || tipo;
}

module.exports = { valida_contratto, RANGES };
