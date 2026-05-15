/**
 * anatocismo_engine.js — Modulo Anatocismo (Sessione F)
 * Engine normativo per l'analisi dell'anatocismo su ammortamento francese
 *
 * AVVERTENZA LEGALE: La questione dell'anatocismo nell'ammortamento alla
 * francese è oggetto di significativo contrasto giurisprudenziale, incluso
 * il recente intervento delle Sezioni Unite (Cass. SU 15130/2024).
 * Il presente modulo segnala SEMPRE questa controversia e NON emette
 * verdetti definitivi. È esclusivamente un decision support system.
 */

const {
  ricostruisci_piano_francese,
  calcola_interessi_su_interessi,
  verifica_coerenza_rate
} = require('../math/ammortamento_calculator');

// Regole anatocismo da semare nel DB (R010-R015)
const REGOLE_ANATOCISMO_SEED = [
  {
    codice: 'R010',
    titolo: 'Anatocismo - Divieto art. 1283 c.c.',
    tipo: 'anatocismo',
    contenuto: 'L\'anatocismo (capitalizzazione degli interessi) è vietato dall\'art. 1283 c.c. salvo usi normativi o accordo successivo alla scadenza. Nell\'ammortamento alla francese la questione è se la struttura matematica integri anatocismo occulto.',
    riferimento: 'Art. 1283 c.c.'
  },
  {
    codice: 'R011',
    titolo: 'Anatocismo - Orientamento favorevole Cass. 2232/2020',
    tipo: 'anatocismo',
    contenuto: 'Secondo Cass. 2232/2020 e successive conformi, nell\'ammortamento alla francese ogni rata è calcolata sugli interessi del solo capitale residuo, senza capitalizzazione degli interessi pregressi, quindi senza anatocismo.',
    riferimento: 'Cass. 2232/2020'
  },
  {
    codice: 'R012',
    titolo: 'Anatocismo - Orientamento contrario Cass. SU 15130/2024',
    tipo: 'anatocismo',
    contenuto: 'Cass. Sezioni Unite 15130/2024 ha affermato che nell\'ammortamento francese si produce un effetto anatocistico derivante dalla struttura matematica della rata costante. Questo orientamento ha peso elevato essendo pronuncia delle SS.UU.',
    riferimento: 'Cass. SU 15130/2024'
  },
  {
    codice: 'R013',
    titolo: 'Anatocismo - Soglie score 0-3',
    tipo: 'anatocismo',
    contenuto: 'Score anatocismo: 0=delta<0.5% o ammortamento non francese; 1=delta 0.5-2% (basso impatto); 2=delta 2-5% (medio impatto); 3=delta>5% (alto impatto). Score NON indica certezza di anomalia data la controversia giurisprudenziale.',
    riferimento: 'Criteri interni BBRE'
  },
  {
    codice: 'R014',
    titolo: 'Anatocismo - Obbligo disclaimer su controversia',
    tipo: 'anatocismo',
    contenuto: 'Ogni analisi anatocismo deve contenere il disclaimer: "La questione è oggetto di significativo contrasto giurisprudenziale, incluso Cass. SU 15130/2024. Il calcolo è puramente indicativo."',
    riferimento: 'Policy BBRE-AB'
  },
  {
    codice: 'R015',
    titolo: 'Anatocismo - Uso pratico BBRE (NPL/stralci/aste)',
    tipo: 'anatocismo',
    contenuto: 'Score anatocismo >= 2 su contratto in NPL/stralcio/asta rappresenta argomento negoziale: il debitore potrebbe vantare un credito restitutorio verso la banca che riduce il passivo reale. Quantificare e includere nel dossier pre-istruttorio.',
    riferimento: 'Procedura operativa BBRE'
  }
];

/**
 * seed_regole_anatocismo
 * Inserisce nel DB le regole R010-R015 (idempotente con INSERT OR IGNORE)
 */
function seed_regole_anatocismo(db) {
  try {
    for (const r of REGOLE_ANATOCISMO_SEED) {
      db.run(`
        INSERT OR IGNORE INTO regole_normative
        (codice_regola, descrizione, tipo_regola, parametri, attiva, valid_from, valid_to)
        VALUES (?, ?, ?, ?, 1, '2024-01-01', NULL)
      `, [
        r.codice,
        r.contenuto,
        r.tipo,
        JSON.stringify({ titolo: r.titolo, riferimento: r.riferimento })
      ]);
    }
    console.log('✅ Seed regole anatocismo R010-R015 completato');
  } catch (err) {
    console.warn('⚠️ Seed regole anatocismo:', err.message);
  }
}

/**
 * analizza_anatocismo
 * Funzione principale: analizza l'anatocismo per un contratto a ammortamento francese.
 *
 * @param {Object} db          — istanza sql.js
 * @param {Object} contratto   — { capitale, tan_dichiarato, durata_mesi, data_stipula, ammortamento }
 * @param {Array}  rate_reali  — array opzionale rate reali { n, rata, quota_interessi?, quota_capitale? }
 * @returns {Object} risultato anatocismo
 */
function analizza_anatocismo(db, contratto, rate_reali = []) {
  const DISCLAIMER = 'La questione dell\'anatocismo nell\'ammortamento alla francese è oggetto di ' +
    'significativo contrasto giurisprudenziale, incluso un recente intervento delle Sezioni Unite ' +
    '(Cass. SU 15130/2024). Il presente calcolo è pertanto da considerarsi puramente indicativo ' +
    'e non sostituisce una perizia econometrica.';

  // Verifica tipo ammortamento
  const ammortamento = (contratto.ammortamento || '').toLowerCase();
  const is_francese  = ammortamento === 'francese' || ammortamento === '' || ammortamento == null;

  if (!is_francese) {
    return {
      score_anatocismo:     0,
      delta_euro:           0,
      delta_pct:            0,
      piano_rate:           [],
      orientamento:         'Non applicabile',
      warnings:             ['Ammortamento non francese — analisi anatocismo non applicabile'],
      disclaimer:           DISCLAIMER,
      applicabile:          false
    };
  }

  // Seed regole se necessario
  try { seed_regole_anatocismo(db); } catch (_) {}

  // Ricostruisci piano
  const contratto_calc = {
    capitale:     contratto.capitale,
    tan:          contratto.tan_dichiarato,
    durata_mesi:  contratto.durata_mesi,
    data_stipula: contratto.data_stipula
  };

  let piano_rate;
  try {
    piano_rate = ricostruisci_piano_francese(contratto_calc);
  } catch (err) {
    return {
      score_anatocismo: 0,
      delta_euro:       0,
      delta_pct:        0,
      piano_rate:       [],
      orientamento:     'Errore calcolo',
      warnings:         ['Errore ricostruzione piano: ' + err.message],
      disclaimer:       DISCLAIMER,
      applicabile:      false
    };
  }

  // Calcola delta interessi su interessi
  const analisi_delta = calcola_interessi_su_interessi(piano_rate, contratto_calc);
  const { delta_stimato, percentuale_incidenza, totale_interessi_francese, totale_interessi_puro } = analisi_delta;

  // Verifica coerenza con rate reali (se fornite)
  const verifica = verifica_coerenza_rate(piano_rate, rate_reali);

  // Score anatocismo
  let score_anatocismo;
  if (percentuale_incidenza < 0.5)      score_anatocismo = 0;
  else if (percentuale_incidenza < 2.0) score_anatocismo = 1;
  else if (percentuale_incidenza < 5.0) score_anatocismo = 2;
  else                                   score_anatocismo = 3;

  // Orientamento giurisprudenziale
  const score_label = {
    0: 'Delta trascurabile — impatto praticamente nullo',
    1: 'Delta basso (0.5–2%) — impatto limitato',
    2: 'Delta medio (2–5%) — argomento negoziale potenziale',
    3: 'Delta alto (>5%) — argomento forte per dossier pre-istruttorio'
  };

  const orientamento = 'DIVISO — Favorevole: Cass. 2232/2020 | Contrario: Cass. SU 15130/2024 (peso elevato)';

  // Warnings
  const warnings = [DISCLAIMER];
  if (score_anatocismo >= 2) {
    warnings.push(
      `Delta stimato €${delta_stimato.toFixed(2)} (${percentuale_incidenza.toFixed(2)}% del totale interessi). ` +
      `Su pratiche NPL/stralcio/asta: includere nel dossier pre-istruttorio come argomento negoziale.`
    );
  }
  if (verifica.coerente === false) {
    warnings.push('⚠️ ' + verifica.nota);
  }

  // Fattori esplicativi (schema coerente con score_engine.js)
  const fattori_anatocismo = [
    {
      id: 'A1',
      nome: 'Tipo ammortamento',
      valore_label: 'Francese — soggetto ad analisi anatocismo',
      impatto: 'Applicabile'
    },
    {
      id: 'A2',
      nome: 'Delta interessi stimato',
      valore_label: `€${delta_stimato.toFixed(2)} su totale interessi €${totale_interessi_francese.toFixed(2)}`,
      impatto: score_anatocismo >= 2 ? 'Significativo' : score_anatocismo === 1 ? 'Limitato' : 'Trascurabile'
    },
    {
      id: 'A3',
      nome: 'Incidenza percentuale',
      valore_label: `${percentuale_incidenza.toFixed(4)}% degli interessi totali`,
      impatto: score_label[score_anatocismo]
    },
    {
      id: 'A4',
      nome: 'Totale interessi francese vs puro',
      valore_label: `Francese: €${totale_interessi_francese.toFixed(2)} | Puro: €${totale_interessi_puro.toFixed(2)}`,
      impatto: 'Comparativo'
    },
    {
      id: 'A5',
      nome: 'Orientamento giurisprudenziale',
      valore_label: orientamento,
      impatto: 'CONTROVERSO — non definitivo'
    },
    {
      id: 'A6',
      nome: 'Verifica coerenza piano',
      valore_label: verifica.coerente === null
        ? 'Non eseguita (no rate reali)'
        : verifica.coerente
          ? 'Coerente con rate reali fornite'
          : `${verifica.discrepanze.length} discrepanze rilevate`,
      impatto: verifica.coerente === false ? 'Attenzione' : 'Neutro'
    }
  ];

  return {
    score_anatocismo,
    label_anatocismo:    score_label[score_anatocismo],
    delta_euro:          delta_stimato,
    delta_pct:           percentuale_incidenza,
    totale_interessi_francese,
    totale_interessi_puro,
    piano_rate,
    verifica_coerenza:   verifica,
    fattori_anatocismo,
    orientamento,
    warnings,
    disclaimer:          DISCLAIMER,
    applicabile:         true
  };
}

module.exports = {
  analizza_anatocismo,
  seed_regole_anatocismo,
  REGOLE_ANATOCISMO_SEED
};
