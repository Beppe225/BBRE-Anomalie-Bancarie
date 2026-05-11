/**
 * irr_teg.js - Calcolo IRR conforme TEG italiano
 * FASE 2: Newton-Raphson con fallback bisezione
 */

function calcola_irr(flussi_cassa, tan_seed = null, max_iter = 1000, tol = 1e-7) {
  console.log('🧮 Calcolo IRR con', flussi_cassa.length, 'flussi...');
  console.log('Flussi:', flussi_cassa.map(f => f.toFixed(2)).join(', '));

  // Verifica che ci siano flussi positivi e negativi
  const hasPositive = flussi_cassa.some(f => f > 0);
  const hasNegative = flussi_cassa.some(f => f < 0);
  
  if (!hasPositive || !hasNegative) {
    console.error('❌ Flussi non validi: devono esserci sia entrate che uscite');
    return {
      irr_annuale: 0,
      convergenza: false,
      iterazioni: 0,
      metodo_usato: 'Errore flussi'
    };
  }

  // Funzione NPV (Net Present Value)
  const npv = (rate) => {
    if (rate <= -1) return Infinity; // Evita divisione per zero
    let sum = 0;
    for (let i = 0; i < flussi_cassa.length; i++) {
      const t = i / 12; // anni (periodicità mensile)
      const denominator = Math.pow(1 + rate, t);
      if (denominator === 0) return Infinity;
      sum += flussi_cassa[i] / denominator;
    }
    return sum;
  };

  // Derivata NPV
  const dnpv = (rate) => {
    if (rate <= -1) return 0;
    let sum = 0;
    for (let i = 1; i < flussi_cassa.length; i++) {
      const t = i / 12;
      const denominator = Math.pow(1 + rate, t + 1);
      if (denominator === 0) continue;
      sum -= (t * flussi_cassa[i]) / denominator;
    }
    return sum;
  };

  // Seed iniziale: TAN o 10%
  let rate = tan_seed !== null && tan_seed > 0 ? tan_seed : 0.10;
  if (rate < 0.01 || rate > 1) {
    console.warn('⚠️ TAN seed fuori range, uso 10%');
    rate = 0.10;
  }
  
  let iter = 0;
  let converged = false;
  let method = 'Newton-Raphson';

  console.log('Seed iniziale:', (rate * 100).toFixed(2) + '%');

  // Newton-Raphson
  for (iter = 0; iter < max_iter; iter++) {
    const f = npv(rate);
    const df = dnpv(rate);

    if (Math.abs(df) < 1e-10) {
      console.log('⚠️ Derivata troppo piccola, passo a bisezione');
      method = 'Bisezione (derivata nulla)';
      break;
    }

    const newRate = rate - f / df;

    if (Math.abs(newRate - rate) < tol && Math.abs(f) < tol) {
      converged = true;
      rate = newRate;
      console.log(`✅ Convergenza in ${iter} iterazioni`);
      break;
    }

    if (newRate <= -0.99 || newRate > 10) {
      console.warn(`⚠️ Rate instabile (${(newRate * 100).toFixed(2)}%), passo a bisezione`);
      method = 'Bisezione (rate instabile)';
      break;
    }

    rate = newRate;

    if (iter === 500) {
      method = 'Bisezione (fallback)';
      break;
    }
  }

  // Fallback a bisezione
  if (!converged || method.includes('Bisezione')) {
    console.log('🔄 Esecuzione bisezione...');
    rate = bisezione(flussi_cassa, -0.99, 2.0, tol, 500);
    converged = true;
  }

  console.log(`IRR finale: ${(rate * 100).toFixed(4)}% (${method})`);

  return {
    irr_annuale: rate,
    convergenza: converged,
    iterazioni: iter,
    metodo_usato: method
  };
}

function bisezione(flussi, low, high, tol, max_iter) {
  const npv_b = (rate) => {
    if (rate <= -1) return Infinity;
    let sum = 0;
    for (let i = 0; i < flussi.length; i++) {
      const t = i / 12;
      const denom = Math.pow(1 + rate, t);
      if (denom === 0) return Infinity;
      sum += flussi[i] / denom;
    }
    return sum;
  };
  
  let f_low = npv_b(low);
  let f_high = npv_b(high);

  if (f_low * f_high > 0) {
    console.warn('⚠️ Nessun root nell\'intervallo, estendo a 500%');
    high = 5.0;
    f_high = npv_b(high);
    
    if (f_low * f_high > 0) {
      console.error('❌ Impossibile trovare root, ritorno 0');
      return 0;
    }
  }

  let mid = (low + high) / 2;
  
  for (let i = 0; i < max_iter; i++) {
    mid = (low + high) / 2;
    const f_mid = npv_b(mid);

    if (Math.abs(f_mid) < tol || (high - low) / 2 < tol) {
      console.log(`✅ Bisezione convergente in ${i} iterazioni`);
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

module.exports = { calcola_irr };
