/**
 * irr_teg.js - Calcolo IRR conforme TEG italiano
 * Implementazione Newton-Raphson con fallback bisezione
 */

function calcola_irr(flussi_cassa, tan_seed = null, max_iter = 1000, tol = 1e-7) {
  // Funzione NPV (Net Present Value)
  const npv = (rate) => {
    let sum = 0;
    for (let i = 0; i < flussi_cassa.length; i++) {
      // Convenzione TEG: base 365 gg, periodicità mensile
      const t = i / 12; // anni
      sum += flussi_cassa[i] / Math.pow(1 + rate, t);
    }
    return sum;
  };

  // Derivata NPV per Newton-Raphson
  const dnpv = (rate) => {
    let sum = 0;
    for (let i = 1; i < flussi_cassa.length; i++) {
      const t = i / 12;
      sum -= (t * flussi_cassa[i]) / Math.pow(1 + rate, t + 1);
    }
    return sum;
  };

  // Seed iniziale basato su TAN se fornito
  let rate = tan_seed || 0.05;
  let iter = 0;
  let converged = false;
  let method = 'Newton-Raphson';

  // Newton-Raphson
  for (iter = 0; iter < max_iter; iter++) {
    const f = npv(rate);
    const df = dnpv(rate);

    if (Math.abs(df) < 1e-10) break;

    const newRate = rate - f / df;

    if (Math.abs(newRate - rate) < tol) {
      converged = true;
      rate = newRate;
      break;
    }

    rate = newRate;

    // Fallback a bisezione dopo 500 iterazioni
    if (iter === 500) {
      method = 'Bisezione (fallback)';
      rate = bisezione(flussi_cassa, -0.99, 1.0, tol, 500);
      break;
    }
  }

  return {
    irr_annuale: rate,
    convergenza: converged,
    iterazioni: iter,
    metodo_usato: method
  };
}

// Algoritmo di bisezione come fallback
function bisezione(flussi, low, high, tol, max_iter) {
  let mid = (low + high) / 2;
  let f_low = npv_b(flussi, low);
  let f_high = npv_b(flussi, high);

  if (f_low * f_high > 0) return mid; // Nessun root nell'intervallo

  for (let i = 0; i < max_iter; i++) {
    mid = (low + high) / 2;
    const f_mid = npv_b(flussi, mid);

    if (Math.abs(f_mid) < tol || (high - low) / 2 < tol) {
      return mid;
    }

    if (f_low * f_mid < 0) {
      high = mid;
      f_high = f_mid;
    } else {
      low = mid;
      f_low = f_mid;
    }
  }

  return mid;
}

function npv_b(flussi, rate) {
  let sum = 0;
  for (let i = 0; i < flussi.length; i++) {
    const t = i / 12;
    sum += flussi[i] / Math.pow(1 + rate, t);
  }
  return sum;
}

module.exports = { calcola_irr };
