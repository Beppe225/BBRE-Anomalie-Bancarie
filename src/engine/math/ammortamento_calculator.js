/**
 * ammortamento_calculator.js — Modulo Anatocismo (Sessione F)
 * Ricostruzione piano ammortamento francese e stima interessi su interessi
 *
 * NOTA GIURIDICA: La questione dell'anatocismo nell'ammortamento alla francese
 * è oggetto di significativo contrasto giurisprudenziale, incluso l'intervento
 * delle Sezioni Unite (Cass. SU 15130/2024). I calcoli qui prodotti sono
 * puramente indicativi e non sostituiscono una perizia econometrica.
 */

/**
 * Aggiunge N mesi a una data ISO (YYYY-MM-DD)
 */
function aggiungi_mesi(dataIso, mesi) {
  const d = new Date(dataIso);
  d.setMonth(d.getMonth() + mesi);
  return d.toISOString().slice(0, 10);
}

/**
 * ricostruisci_piano_francese
 * Ricostruisce il piano di ammortamento alla francese rata per rata.
 *
 * @param {Object} contratto
 *   { capitale: number, tan: number (decimale), durata_mesi: number, data_stipula: string }
 * @returns {Array} piano — array di oggetti rata
 */
function ricostruisci_piano_francese(contratto) {
  const { capitale, tan, durata_mesi, data_stipula } = contratto;

  if (!capitale || capitale <= 0) throw new Error('Capitale non valido');
  if (tan == null || tan < 0)     throw new Error('TAN non valido');
  if (!durata_mesi || durata_mesi <= 0) throw new Error('Durata non valida');

  // Tasso mensile
  const i = tan / 12;

  // Rata costante (formula ammortamento francese)
  let rata;
  if (i === 0) {
    rata = capitale / durata_mesi;
  } else {
    rata = (capitale * i) / (1 - Math.pow(1 + i, -durata_mesi));
  }

  const piano = [];
  let debito_residuo = capitale;

  for (let n = 1; n <= durata_mesi; n++) {
    const debito_residuo_inizio = debito_residuo;
    const quota_interessi = i === 0 ? 0 : debito_residuo_inizio * i;
    const quota_capitale  = rata - quota_interessi;
    debito_residuo = Math.max(0, debito_residuo_inizio - quota_capitale);

    // Stima interessi su interessi (quota anatocistica):
    // Nell'ammortamento francese, gli interessi del periodo sono calcolati
    // sul debito residuo che include la quota interessi del mese precedente
    // non ancora ammortizzata. La differenza rispetto a un ammortamento
    // "puro" (dove gli interessi non si capitalizzano mai) è la stima.
    const interessi_su_interessi_stimati = n > 1
      ? quota_interessi - (capitale / durata_mesi) * i * (durata_mesi - n + 1) / (durata_mesi - n + 1)
      : 0;

    piano.push({
      n,
      data_scadenza:            data_stipula ? aggiungi_mesi(data_stipula, n) : null,
      rata:                     parseFloat(rata.toFixed(2)),
      quota_interessi:          parseFloat(quota_interessi.toFixed(2)),
      quota_capitale:           parseFloat(quota_capitale.toFixed(2)),
      debito_residuo_inizio:    parseFloat(debito_residuo_inizio.toFixed(2)),
      debito_residuo_fine:      parseFloat(debito_residuo.toFixed(2)),
      interessi_su_interessi_stimati: parseFloat(Math.max(0, interessi_su_interessi_stimati).toFixed(4))
    });
  }

  return piano;
}

/**
 * calcola_interessi_su_interessi
 * Confronta ammortamento francese vs ammortamento "puro" (interessi non capitalizzati).
 *
 * Il metodo confronta:
 * - Totale interessi francese = somma delle quote interessi del piano francese
 * - Totale interessi "puro"   = stima dove ogni mese gli interessi sono calcolati
 *   sul solo debito residuo di quota capitale (senza accumulo anatocistico)
 *
 * @param {Array} piano_rate — output di ricostruisci_piano_francese
 * @param {Object} contratto — { capitale, tan, durata_mesi }
 * @returns {Object} { totale_interessi_francese, totale_interessi_puro, delta_stimato, percentuale_incidenza }
 */
function calcola_interessi_su_interessi(piano_rate, contratto) {
  if (!piano_rate || piano_rate.length === 0) {
    throw new Error('Piano rate vuoto o non valido');
  }

  const { capitale, tan, durata_mesi } = contratto;
  const i = tan / 12;

  // Totale interessi piano francese
  const totale_interessi_francese = piano_rate.reduce((sum, r) => sum + r.quota_interessi, 0);

  // Ammortamento "puro": quota capitale costante (capitale / durata_mesi),
  // interessi calcolati sempre solo sul debito residuo senza capitalizzazione
  let totale_interessi_puro = 0;
  const quota_cap_pura = capitale / durata_mesi;

  for (let n = 0; n < durata_mesi; n++) {
    const debito_residuo_puro = capitale - quota_cap_pura * n;
    totale_interessi_puro += debito_residuo_puro * i;
  }

  const delta_stimato = Math.max(0, totale_interessi_francese - totale_interessi_puro);
  const percentuale_incidenza = totale_interessi_francese > 0
    ? (delta_stimato / totale_interessi_francese) * 100
    : 0;

  return {
    totale_interessi_francese: parseFloat(totale_interessi_francese.toFixed(2)),
    totale_interessi_puro:     parseFloat(totale_interessi_puro.toFixed(2)),
    delta_stimato:             parseFloat(delta_stimato.toFixed(2)),
    percentuale_incidenza:     parseFloat(percentuale_incidenza.toFixed(4))
  };
}

/**
 * verifica_coerenza_rate
 * Confronta il piano ricostruito con le rate reali fornite dall'utente.
 *
 * @param {Array} piano_ricostruito — output di ricostruisci_piano_francese
 * @param {Array} rate_reali — array di { n, rata, quota_interessi?, quota_capitale? }
 * @returns {Object} { coerente, discrepanze[], nota }
 */
function verifica_coerenza_rate(piano_ricostruito, rate_reali) {
  if (!rate_reali || rate_reali.length === 0) {
    return {
      coerente: null,
      discrepanze: [],
      nota: 'Nessuna rata reale fornita — verifica non eseguita'
    };
  }

  const SOGLIA_DISCREPANZA = 0.50; // euro
  const discrepanze = [];

  rate_reali.forEach(rr => {
    const rp = piano_ricostruito.find(r => r.n === rr.n);
    if (!rp) return;

    const diff_rata = Math.abs((rr.rata || 0) - rp.rata);
    if (diff_rata > SOGLIA_DISCREPANZA) {
      discrepanze.push({
        n:             rr.n,
        rata_reale:    rr.rata,
        rata_teorica:  rp.rata,
        differenza:    parseFloat(diff_rata.toFixed(2)),
        tipo:          'rata'
      });
    }

    if (rr.quota_interessi != null) {
      const diff_int = Math.abs(rr.quota_interessi - rp.quota_interessi);
      if (diff_int > SOGLIA_DISCREPANZA) {
        discrepanze.push({
          n:                    rr.n,
          quota_interessi_reale:   rr.quota_interessi,
          quota_interessi_teorica: rp.quota_interessi,
          differenza:           parseFloat(diff_int.toFixed(2)),
          tipo:                 'quota_interessi'
        });
      }
    }
  });

  const coerente = discrepanze.length === 0;
  const nota = coerente
    ? 'Piano ricostruito coerente con le rate reali fornite'
    : `Rilevate ${discrepanze.length} discrepanze significative (soglia: €${SOGLIA_DISCREPANZA}). Verificare i dati contrattuali.`;

  return { coerente, discrepanze, nota };
}

module.exports = {
  ricostruisci_piano_francese,
  calcola_interessi_su_interessi,
  verifica_coerenza_rate
};
