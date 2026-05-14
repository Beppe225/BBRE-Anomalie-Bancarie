'use strict';

/**
 * BBRE Anomalie Bancarie — Modulo: irr_calculator.js
 * Livello: MATEMATICA PURA — nessun accesso DB, nessun side effect
 * Tutti i calcoli IRR/TEG avvengono qui.
 */

const MAX_ITERAZIONI = 1000;
const PRECISIONE = 0.000001;

/**
 * Calcola il VAN (Valore Attuale Netto) per un dato tasso mensile.
 * @param {Array<{periodo_mese: number, importo: number}>} flussi
 * @param {number} tasso_mensile
 * @returns {number}
 */
function calcola_van(flussi, tasso_mensile) {
  return flussi.reduce((acc, f) => {
    return acc + f.importo / Math.pow(1 + tasso_mensile, f.periodo_mese);
  }, 0);
}

/**
 * Derivata del VAN rispetto al tasso mensile (per Newton-Raphson).
 * @param {Array<{periodo_mese: number, importo: number}>} flussi
 * @param {number} tasso_mensile
 * @returns {number}
 */
function calcola_derivata_van(flussi, tasso_mensile) {
  return flussi.reduce((acc, f) => {
    return acc - f.periodo_mese * f.importo / Math.pow(1 + tasso_mensile, f.periodo_mese + 1);
  }, 0);
}

/**
 * Calcola IRR tramite metodo Newton-Raphson.
 * @param {Array<{periodo_mese: number, importo: number}>} flussi
 *   - periodo_mese: 0 = erogazione, 1..N = rate
 *   - importo: negativo = uscita (erogazione), positivo = entrata (rata)
 * @returns {{irr_mensile: number|null, irr_annuale: number|null, convergenza_ok: boolean, iterazioni: number}}
 */
function calcola_irr(flussi) {
  // Validazione input
  if (!Array.isArray(flussi) || flussi.length < 2) {
    return { irr_mensile: null, irr_annuale: null, convergenza_ok: false, iterazioni: 0 };
  }

  // Deve esserci almeno un flusso negativo e uno positivo
  const ha_negativo = flussi.some(f => f.importo < 0);
  const ha_positivo = flussi.some(f => f.importo > 0);
  if (!ha_negativo || !ha_positivo) {
    return { irr_mensile: null, irr_annuale: null, convergenza_ok: false, iterazioni: 0 };
  }

  // Stima iniziale: 1% mensile
  let tasso = 0.01;
  let iterazioni = 0;
  let convergenza_ok = false;

  for (let i = 0; i < MAX_ITERAZIONI; i++) {
    iterazioni++;
    const van = calcola_van(flussi, tasso);
    const derivata = calcola_derivata_van(flussi, tasso);

    if (Math.abs(derivata) < 1e-12) break; // derivata troppo piccola, stop

    const nuovo_tasso = tasso - van / derivata;

    // Protezione: tasso non può essere <= -1
    const tasso_corretto = Math.max(nuovo_tasso, -0.9999);

    if (Math.abs(tasso_corretto - tasso) < PRECISIONE) {
      tasso = tasso_corretto;
      convergenza_ok = true;
      break;
    }

    tasso = tasso_corretto;
  }

  if (!convergenza_ok) {
    return { irr_mensile: null, irr_annuale: null, convergenza_ok: false, iterazioni };
  }

  const irr_mensile = tasso;
  const irr_annuale = (Math.pow(1 + irr_mensile, 12) - 1) * 100; // in percentuale

  return {
    irr_mensile: parseFloat(irr_mensile.toFixed(8)),
    irr_annuale: parseFloat(irr_annuale.toFixed(4)),
    convergenza_ok: true,
    iterazioni
  };
}

/**
 * Costruisce array di flussi di cassa da contratto + voci selezionate.
 * @param {Object} contratto - {capitale_erogato, rata_mensile, durata_mesi}
 * @param {Array<{importo: number, tipo_flusso: string}>} voci_incluse
 *   tipo_flusso: 'upfront' = al periodo 0, 'mensile' = si somma alla rata
 * @returns {Array<{periodo_mese: number, importo: number}>}
 */
function costruisci_flussi(contratto, voci_incluse = []) {
  const { capitale_erogato, rata_mensile, durata_mesi } = contratto;

  // Voci upfront (somme al periodo 0, riducono la liquidità erogata)
  const costi_upfront = voci_incluse
    .filter(v => v.tipo_flusso === 'upfront')
    .reduce((acc, v) => acc + (v.importo || 0), 0);

  // Voci mensili aggiuntive (es. quota polizza periodica)
  const costi_mensili = voci_incluse
    .filter(v => v.tipo_flusso === 'mensile')
    .reduce((acc, v) => acc + (v.importo || 0), 0);

  const flussi = [];

  // Periodo 0: erogazione netta (negativa = uscita per il mutuatario)
  // Dal punto di vista del CREDITORE: -capitale_erogato + costi_upfront incassati
  // Per il calcolo TEG usiamo la convenzione bancaria:
  // periodo 0 = importo netto ricevuto dal cliente (negativo = esborso banca)
  flussi.push({
    periodo_mese: 0,
    importo: -(capitale_erogato - costi_upfront)
  });

  // Periodi 1..N: rate + eventuali costi mensili
  for (let mese = 1; mese <= durata_mesi; mese++) {
    flussi.push({
      periodo_mese: mese,
      importo: rata_mensile + costi_mensili
    });
  }

  return flussi;
}

/**
 * Calcola il TEG dichiarato-ricalcolato usando le stesse voci incluse nel TAEG
 * dichiarato dalla banca. Permette di verificare la coerenza del TEG dichiarato.
 * @param {Object} contratto
 * @param {Array} voci_incluse_dichiarato - solo le voci che la banca dice di aver incluso
 * @returns {{teg_ricalcolato: number|null, delta_vs_dichiarato: number|null, convergenza_ok: boolean, iterazioni: number}}
 */
function calcola_teg_dichiarato_ricalcolato(contratto, voci_incluse_dichiarato = []) {
  const flussi = costruisci_flussi(contratto, voci_incluse_dichiarato);
  const risultato_irr = calcola_irr(flussi);

  if (!risultato_irr.convergenza_ok) {
    return {
      teg_ricalcolato: null,
      delta_vs_dichiarato: null,
      convergenza_ok: false,
      iterazioni: risultato_irr.iterazioni
    };
  }

  const teg_dichiarato = contratto.teg_dichiarato || null;
  const delta = teg_dichiarato !== null
    ? parseFloat((risultato_irr.irr_annuale - teg_dichiarato).toFixed(4))
    : null;

  return {
    teg_ricalcolato: risultato_irr.irr_annuale,
    delta_vs_dichiarato: delta,
    convergenza_ok: true,
    iterazioni: risultato_irr.iterazioni
  };
}

module.exports = {
  calcola_irr,
  costruisci_flussi,
  calcola_teg_dichiarato_ricalcolato,
  // Esporto anche le funzioni interne per i test
  _calcola_van: calcola_van,
  _calcola_derivata_van: calcola_derivata_van
};
