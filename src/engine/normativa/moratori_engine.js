/**
 * moratori_engine.js — Sessione H: Analisi Interessi Moratori
 *
 * Normativa di riferimento:
 *   - L. 108/1996 art. 1 co. 1: soglia usura si applica anche ai moratori
 *   - Cass. 14899/2017: moratori sommati al TEG per verifica usura
 *   - Cass. 26286/2019: soglia moratoria = soglia TEG + spread (orientamento 2.1pp)
 *   - Cass. SU 24675/2022: confermata applicabilità L.108/96 ai moratori
 *   - ABF Collegio Roma 2021: mora > soglia_normale+2.1pp = presunzione usura
 *
 * Score 0-3:
 *   0 = mora sotto soglia moratoria
 *   1 = zona grigia (delta 0-1pp)
 *   2 = anomalia probabile (delta 1-3pp)
 *   3 = usura moratoria forte (delta >3pp)
 */

/**
 * @param {object|null} db                   - istanza sql.js (non usata direttamente, passata per coerenza)
 * @param {object}      payload              - dati contratto dal form
 * @param {number}      teg_reale            - TEG calcolato dall'orchestrator (decimale, es. 0.17)
 * @param {number}      soglia_decimale      - soglia usura TEG (decimale, es. 0.0625)
 * @returns {object}                         - risultato analisi moratori
 */
function analizza_moratori(db, payload, teg_reale, soglia_decimale) {
  const { tipo_contratto, data_stipula, mora_contrattuale_perc } = payload;

  // Se non fornito → non applicabile
  if (mora_contrattuale_perc == null || mora_contrattuale_perc === '' || isNaN(parseFloat(mora_contrattuale_perc))) {
    return {
      applicabile: false,
      motivo_non_applicabile: 'Tasso di mora contrattuale non inserito',
      score_moratori: 0,
      fattori_moratori: []
    };
  }

  const mora_perc = parseFloat(mora_contrattuale_perc);   // es. 9.5
  const mora_dec  = mora_perc / 100;                       // es. 0.095

  // Soglia moratoria = soglia TEG + 2.1pp (orientamento prevalente ABF + Cass. 26286/2019)
  const SPREAD_MORA_PP   = 2.1;
  const soglia_teg_perc  = soglia_decimale > 1 ? soglia_decimale : soglia_decimale * 100;
  const soglia_mora_perc = soglia_teg_perc + SPREAD_MORA_PP;

  // Delta mora vs soglia moratoria
  const delta_mora_pp = mora_perc - soglia_mora_perc;

  // TEG complessivo simulato (stima conservativa: quota mora ~20% delle rate)
  const teg_reale_perc            = teg_reale > 1 ? teg_reale : teg_reale * 100;
  const QUOTA_MORA_PONDERATA      = 0.20;
  const teg_complessivo_perc      = teg_reale_perc + (mora_perc * QUOTA_MORA_PONDERATA);
  const supera_soglia_base_complessivo = teg_complessivo_perc > soglia_teg_perc;

  const anno_stipula = data_stipula ? parseInt((data_stipula || '').substring(0, 4)) : 0;
  const post_2010    = anno_stipula >= 2010;

  // Score 0-3
  let score_moratori = 0;
  if      (delta_mora_pp <= 0)   score_moratori = 0;
  else if (delta_mora_pp < 1.0)  score_moratori = 1;
  else if (delta_mora_pp < 3.0)  score_moratori = 2;
  else                            score_moratori = 3;

  // Boost se TEG complessivo supera anche la soglia base
  if (supera_soglia_base_complessivo && score_moratori < 3) {
    score_moratori = Math.min(score_moratori + 1, 3);
  }

  const LABELS = {
    0: 'Mora nella norma',
    1: 'Mora in zona grigia — monitorare',
    2: 'Anomalia moratoria probabile',
    3: 'Usura moratoria — caso forte'
  };

  const fattori_moratori = [
    {
      id: 'M1', nome: 'Tasso Mora Contrattuale',
      valore_label: mora_perc.toFixed(2) + '%',
      impatto: mora_perc > soglia_mora_perc ? 'Alto' : 'Basso'
    },
    {
      id: 'M2', nome: 'Soglia Usura Moratoria',
      valore_label: soglia_mora_perc.toFixed(2) + '% (' + soglia_teg_perc.toFixed(2) + '% + ' + SPREAD_MORA_PP + 'pp)',
      impatto: 'Riferimento normativo'
    },
    {
      id: 'M3', nome: 'Delta vs Soglia Moratoria',
      valore_label: delta_mora_pp > 0
        ? '+' + delta_mora_pp.toFixed(2) + 'pp (SOPRA SOGLIA)'
        : delta_mora_pp.toFixed(2) + 'pp (sotto soglia)',
      impatto: delta_mora_pp > 3 ? 'Alto' : delta_mora_pp > 1 ? 'Medio' : delta_mora_pp > 0 ? 'Basso' : 'Nessuno'
    },
    {
      id: 'M4', nome: 'TEG Complessivo Simulato',
      valore_label: teg_complessivo_perc.toFixed(4) + '% (quota mora 20%)',
      impatto: supera_soglia_base_complessivo ? 'Supera soglia TEG base' : 'Sotto soglia TEG base'
    },
    {
      id: 'M5', nome: 'Orientamento Giurisprudenziale',
      valore_label: 'Cass. 14899/2017 · Cass. 26286/2019 · Cass. SU 24675/2022 · ABF Roma 2021',
      impatto: score_moratori >= 2 ? 'FAVOREVOLE a contestazione' : 'Non rilevante'
    },
    {
      id: 'M6', nome: 'Epoca Contratto',
      valore_label: anno_stipula >= 2017 ? 'Post-2017 (normativa più consolidata)'
                  : anno_stipula >= 2010 ? '2010-2016'
                  : anno_stipula > 0 ? 'Ante-2010 (orientamento diviso)'
                  : 'Non specificata',
      impatto: post_2010 ? 'Favorevole a contestazione' : 'Diviso'
    }
  ];

  const disclaimer = score_moratori >= 2
    ? 'ATTENZIONE: La giurisprudenza sull\'applicabilità della L.108/96 ai moratori, pur confermata da Cass. SU 24675/2022, presenta profili applicativi complessi. Richiedere perizia tecnica per uso giudiziario.'
    : 'Analisi indicativa. Verificare con perizia tecnica per uso in sede giudiziaria.';

  return {
    applicabile:                    true,
    mora_contrattuale_perc:         mora_perc,
    soglia_teg_perc,
    soglia_mora_perc,
    spread_mora_pp:                 SPREAD_MORA_PP,
    delta_mora_pp,
    teg_reale_perc,
    teg_complessivo_perc,
    supera_soglia_mora:             delta_mora_pp > 0,
    supera_soglia_base_complessivo,
    score_moratori,
    label_moratori:                 LABELS[score_moratori],
    fattori_moratori,
    disclaimer,
    anno_stipula,
    riferimenti_normativi: [
      'L. 108/1996 art. 1 co. 1',
      'Cass. 14899/2017',
      'Cass. 26286/2019',
      'Cass. SU 24675/2022',
      'ABF Collegio Roma 2021'
    ]
  };
}

module.exports = { analizza_moratori };
