/**
 * BBRE Engine Matematico: Calcolo IRR (TEG)
 * Convenzione: Actual/365, periodicità mensile.
 * Algoritmo: Newton-Raphson (max 500 iter) -> Fallback Bisezione [-1, 1]
 */

function calcola_irr(flussi_cassa, date_iso, tan_seed = 0.10) {
  if (!flussi_cassa || flussi_cassa.length < 2) {
    return { irr_annuale: 0, convergenza: false, iterazioni: 0, metodo_usato: 'Dati insufficienti' };
  }

  // 1. Preparazione dati: ordinamento e calcolo giorni da t0
  const punti = date_iso.map((d, i) => ({
    data: new Date(d),
    flusso: flussi_cassa[i],
    giorni: 0
  })).sort((a, b) => a.data - b.data);

  const t0 = punti[0].data;
  
  // Calcola giorni effettivi rispetto a t0
  punti.forEach(p => {
    p.giorni = (p.data - t0) / (1000 * 60 * 60 * 24);
  });

  // ❌ RIMOSSO: Controllo errato sulla somma flussi
  // La somma positiva è NORMALE nei finanziamenti (interessi)

  // 2. Funzioni matematiche per Newton-Raphson
  // f(r) = somma [ Flusso / (1+r)^(giorni/365) ]
  function valuta_funzione(r) {
    return punti.reduce((acc, p) => {
      return acc + (p.flusso / Math.pow(1 + r, p.giorni / 365));
    }, 0);
  }

  // f'(r) = derivata della funzione
  function valuta_derivata(r) {
    return punti.reduce((acc, p) => {
      const esponente = p.giorni / 365;
      // Derivata di x^-n è -n * x^(-n-1)
      return acc - (p.flusso * esponente) / Math.pow(1 + r, esponente + 1);
    }, 0);
  }

  // 3. Esecuzione Newton-Raphson
  let r = tan_seed; // Seed iniziale (es. TAN del contratto)
  let iterazioni = 0;
  let convergenza = false;
  const tolleranza = 1e-7;

  for (; iterazioni < 500; iterazioni++) {
    const val = valuta_funzione(r);
    const der = valuta_derivata(r);

    // Se siamo vicini allo zero, abbiamo trovato la radice
    if (Math.abs(val) < tolleranza) {
      convergenza = true;
      break;
    }

    // Se la derivata è quasi zero, Newton fallisce (passa a bisezione dopo il ciclo)
    if (Math.abs(der) < 1e-12) {
      break; 
    }

    // Aggiornamento r
    const r_new = r - (val / der);
    
    // Prevenzione divergence: se r diventa irrealisticamente alto/basso
    if (Math.abs(r_new) > 100) break;
    
    r = r_new;
  }

  // 4. Fallback: Bisezione se Newton non ha converguto
  if (!convergenza) {
    // Intervallo di ricerca [-0.99, 5] (tassi tra -99% e 500%)
    let a = -0.99;
    let b = 5.0;
    
    // Verifica se la radice esiste nell'intervallo
    const fa = valuta_funzione(a);
    const fb = valuta_funzione(b);
    
    if (fa * fb > 0) {
      // Nessun cambio di segno, proviamo comunque con l'ultimo valore di Newton
      return { irr_annuale: parseFloat(r.toFixed(6)), convergenza: false, iterazioni: iterazioni, metodo_usato: 'Newton-Fail / No Root' };
    }

    // Loop Bisezione
    for (; iterazioni < 1000; iterazioni++) {
      let c = (a + b) / 2;
      let fc = valuta_funzione(c);

      if (Math.abs(fc) < tolleranza || (b - a) / 2 < tolleranza) {
        r = c;
        convergenza = true;
        break;
      }

      const fa_curr = valuta_funzione(a);
      if (fa_curr * fc < 0) {
        b = c;
      } else {
        a = c;
      }
    }
  }

  return {
    irr_annuale: parseFloat(r.toFixed(6)),
    convergenza: convergenza,
    iterazioni: iterazioni,
    metodo_usato: convergenza ? (iterazioni < 500 ? 'Newton-Raphson' : 'Bisezione') : 'Non Convergente'
  };
}

module.exports = { calcola_irr };
