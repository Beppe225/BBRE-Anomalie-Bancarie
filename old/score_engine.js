'use strict';

/**
 * BBRE Anomalie Bancarie — Modulo: score_engine.js
 * Livello: NORMATIVA — calcola score basato su fattori espliciti
 * ZERO magia: ogni punto di score è motivato da un fattore documentato.
 */

/**
 * Determina l'epoca del contratto in base alla data di stipula.
 * @param {string|Date} data_stipula
 * @returns {'ante2010'|'2010_2016'|'post2017'}
 */
function get_epoca_contratto(data_stipula) {
  const anno = new Date(data_stipula).getFullYear();
  if (anno < 2010) return 'ante2010';
  if (anno <= 2016) return '2010_2016';
  return 'post2017';
}

/**
 * Determina l'orientamento giurisprudenziale per una fattispecie.
 * Basato sull'epoca e su altri fattori.
 * @param {string} epoca
 * @param {boolean} polizza_condizionante
 * @param {number} delta_percentuale
 * @returns {'FAVOREVOLE'|'DIVISO'|'SFAVOREVOLE'}
 */
function get_orientamento_giurisprudenziale(epoca, polizza_condizionante, delta_percentuale) {
  // Post-2017 con polizza condizionante e delta rilevante: orientamento FAVOREVOLE
  if (epoca === 'post2017' && polizza_condizionante && delta_percentuale > 1.0) {
    return 'FAVOREVOLE';
  }
  // Periodo 2010-2016: orientamento storicamente DIVISO
  if (epoca === '2010_2016') {
    if (delta_percentuale > 2.0) return 'FAVOREVOLE';
    return 'DIVISO';
  }
  // Ante-2010: formula soglia diversa, orientamento più DIVISO
  if (epoca === 'ante2010') {
    return 'DIVISO';
  }
  // Post-2017, delta minore: orientamento più recente, tendenzialmente favorevole se delta > 0
  if (delta_percentuale > 2.0) return 'FAVOREVOLE';
  if (delta_percentuale > 0.5) return 'DIVISO';
  return 'SFAVOREVOLE';
}

/**
 * Calcola l'affidabilità dell'analisi in base alla completezza dei dati.
 * @param {Object} contratto
 * @param {Array} voci_analizzate
 * @returns {'alta'|'media'|'bassa'}
 */
function calcola_affidabilita(contratto, voci_analizzate) {
  let punti = 0;
  let max_punti = 0;

  // Dati contratto essenziali
  const campi_essenziali = ['capitale_erogato', 'rata_mensile', 'durata_mesi', 'tan', 'teg_dichiarato'];
  campi_essenziali.forEach(campo => {
    max_punti++;
    if (contratto[campo] !== null && contratto[campo] !== undefined && contratto[campo] !== 0) {
      punti++;
    }
  });

  // Documento caricato
  max_punti++;
  if (contratto.documento_caricato) punti++;

  // Voci non stimate
  max_punti++;
  const voci_stimate = voci_analizzate.filter(v => v.stimata === true || v.stimata === 1).length;
  if (voci_stimate === 0) punti++;
  else if (voci_stimate <= 1) punti += 0.5;

  const ratio = punti / max_punti;
  if (ratio >= 0.85) return 'alta';
  if (ratio >= 0.60) return 'media';
  return 'bassa';
}

/**
 * Calcola lo score anomalia 0-4.
 *
 * FATTORI (tutti espliciti e documentati nel report):
 *   F1: delta_percentuale = teg_reale - tasso_soglia
 *   F2: polizza_condizionante_presente
 *   F3: epoca_contratto
 *   F4: orientamento_giurisprudenziale
 *   F5: moratori_in_anomalia
 *   F6: completezza_dati (→ affidabilità)
 *
 * SCALA SCORE:
 *   0: teg_reale < soglia (nessuna anomalia)
 *   1: teg_reale > soglia, delta < 0.5% (zona grigia)
 *   2: teg_reale > soglia, delta 0.5% – 2.0% (anomalia possibile)
 *   3: teg_reale > soglia, delta > 2.0% (anomalia probabile)
 *   4: score 3 + polizza condizionante + post-2010 (caso forte)
 *
 * @param {number} teg_reale - TEG reale calcolato (%)
 * @param {Object} soglia_data - output di get_soglia_db()
 * @param {string|Date} data_stipula
 * @param {Array<Object>} voci_analizzate - voci con flag inclusa/esclusa
 * @param {Object} db
 * @param {Object} contratto - dati contrattuali per affidabilità
 * @param {Object} [moratori_data] - {teg_moratori: number|null, soglia_moratori: number}
 * @returns {{
 *   score: number,
 *   label: string,
 *   fattori: Array<{codice: string, nome: string, valore: any, contributo: string}>,
 *   affidabilita: string,
 *   orientamento_giurisprudenziale: string,
 *   teg_reale: number,
 *   tasso_soglia: number,
 *   delta_percentuale: number,
 *   in_usura: boolean
 * }}
 */
function calcola_score(teg_reale, soglia_data, data_stipula, voci_analizzate, db, contratto = {}, moratori_data = null) {
  const tasso_soglia = soglia_data.tasso_soglia;
  const delta_percentuale = parseFloat((teg_reale - tasso_soglia).toFixed(4));
  const in_usura = delta_percentuale > 0;

  // F2: polizza condizionante
  const polizza_condizionante = voci_analizzate.some(
    v => v.inclusa && (v.tipo === 'polizza' || v.tipo === 'assicurazione')
  );

  // F3: epoca
  const epoca = get_epoca_contratto(data_stipula);

  // F4: orientamento giurisprudenziale
  const orientamento = get_orientamento_giurisprudenziale(epoca, polizza_condizionante, delta_percentuale);

  // F5: moratori in anomalia
  let moratori_in_anomalia = false;
  if (moratori_data && moratori_data.teg_moratori !== null && moratori_data.soglia_moratori !== null) {
    moratori_in_anomalia = moratori_data.teg_moratori > moratori_data.soglia_moratori;
  }

  // F6: affidabilità
  const affidabilita = calcola_affidabilita(contratto, voci_analizzate);

  // CALCOLO SCORE BASE
  let score = 0;
  if (!in_usura) {
    score = 0;
  } else if (delta_percentuale < 0.5) {
    score = 1;
  } else if (delta_percentuale <= 2.0) {
    score = 2;
  } else {
    score = 3;
  }

  // UPGRADE A 4: score 3 + polizza condizionante + post-2010
  if (score === 3 && polizza_condizionante && epoca !== 'ante2010') {
    score = 4;
  }

  // DOWNGRADE per bassa affidabilità (non si abbassa mai sotto 1 se in usura)
  if (affidabilita === 'bassa' && score > 1) {
    score = Math.max(score - 1, 1);
  }

  // ETICHETTE
  const labels = {
    0: 'Nessuna anomalia',
    1: 'Zona grigia — approfondire',
    2: 'Anomalia possibile',
    3: 'Anomalia probabile',
    4: 'Caso forte — perizia consigliata'
  };

  // FATTORI DOCUMENTATI
  const fattori = [
    {
      codice: 'F1',
      nome: 'Delta TEG reale vs soglia',
      valore: `${delta_percentuale > 0 ? '+' : ''}${delta_percentuale.toFixed(2)}%`,
      contributo: in_usura
        ? `TEG reale (${teg_reale.toFixed(2)}%) supera soglia (${tasso_soglia.toFixed(2)}%) di ${delta_percentuale.toFixed(2)} punti percentuali`
        : `TEG reale (${teg_reale.toFixed(2)}%) sotto la soglia (${tasso_soglia.toFixed(2)}%) — nessuna anomalia`
    },
    {
      codice: 'F2',
      nome: 'Polizza condizionante presente',
      valore: polizza_condizionante,
      contributo: polizza_condizionante
        ? 'Polizza condizionante rilevata tra le voci incluse — fattore di aggravamento'
        : 'Nessuna polizza condizionante nelle voci incluse'
    },
    {
      codice: 'F3',
      nome: 'Epoca contratto',
      valore: epoca,
      contributo: {
        'ante2010': 'Contratto ante-2010: formula soglia precedente alla riforma L. 108/1996 post-2011',
        '2010_2016': 'Periodo 2010-2016: transizione normativa, giurisprudenza in formazione',
        'post2017': 'Contratto post-2017: normativa consolidata, orientamento giurisprudenziale più definito'
      }[epoca]
    },
    {
      codice: 'F4',
      nome: 'Orientamento giurisprudenziale',
      valore: orientamento,
      contributo: {
        'FAVOREVOLE': 'Orientamento prevalentemente favorevole al mutuatario per fattispecie analoghe',
        'DIVISO': 'Giurisprudenza divisa: esito dipende dal giudice e dalla qualità della documentazione',
        'SFAVOREVOLE': 'Orientamento prevalentemente contrario: rischio di rigetto elevato'
      }[orientamento]
    },
    {
      codice: 'F5',
      nome: 'Moratori in anomalia',
      valore: moratori_in_anomalia,
      contributo: moratori_in_anomalia
        ? `Tasso di mora (${moratori_data.teg_moratori?.toFixed(2)}%) supera soglia moratori (${moratori_data.soglia_moratori?.toFixed(2)}%)`
        : 'Tassi moratori nei limiti o non rilevati'
    },
    {
      codice: 'F6',
      nome: 'Completezza dati (affidabilità)',
      valore: affidabilita,
      contributo: {
        'alta': 'Tutti i dati presenti, nessuna stima, documento originale caricato',
        'media': 'Dati principali presenti, alcune voci stimate — affidabilità media',
        'bassa': 'Dati incompleti o estimati — score penalizzato di 1 punto'
      }[affidabilita]
    }
  ];

  return {
    score,
    label: labels[score],
    fattori,
    affidabilita,
    orientamento_giurisprudenziale: orientamento,
    teg_reale,
    tasso_soglia,
    delta_percentuale,
    in_usura
  };
}

module.exports = {
  calcola_score,
  get_epoca_contratto,
  get_orientamento_giurisprudenziale,
  calcola_affidabilita
};
