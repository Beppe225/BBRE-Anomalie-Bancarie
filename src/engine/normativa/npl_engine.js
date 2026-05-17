/**
 * npl_engine.js — Modulo NPL / Crediti in Sofferenza / Stralcio
 * 
 * Analizza la convenienza di acquisto di un credito NPL o di una
 * proposta di stralcio, calcolando:
 *   - ROI lordo e netto (con costi)
 *   - Recovery Rate e haircut
 *   - Break-even price
 *   - Score opportunità 0-5
 *   - Fattori di rischio (garanzie, debitori, tempi)
 * 
 * AVVERTENZA: I valori sono indicativi. Non sostituiscono la due
 * diligence legale e finanziaria professionale.
 */

/**
 * @param {object} payload
 *   valore_nominale        - Valore nominale del credito (€)
 *   prezzo_acquisto        - Prezzo proposto/pagato (€)
 *   valore_recupero_stima  - Stima recupero netto (€) — dopo costi legali
 *   tipo_garanzia          - 'ipotecaria'|'chirografaria'|'privilegiata'|'nessuna'
 *   anni_contenzioso       - Anni stimati per il recupero (1-10)
 *   costi_legali_stima     - Costi legali/recupero stimati (€)
 *   costi_gestione_stima   - Costi gestione/due diligence (€) [opzionale]
 *   num_debitori           - Numero di debitori nel pacchetto
 *   stato_pratica          - 'sofferenza'|'inadempienz_probab'|'past_due'|'ristrutturato'
 *   note                   - Note libere [opzionale]
 */
function analizza_npl(payload) {
  const {
    valore_nominale,
    prezzo_acquisto,
    valore_recupero_stima,
    tipo_garanzia       = 'chirografaria',
    anni_contenzioso    = 3,
    costi_legali_stima  = 0,
    costi_gestione_stima = 0,
    num_debitori        = 1,
    stato_pratica       = 'sofferenza',
    note                = ''
  } = payload;

  // ── Validazione base ────────────────────────────────────────────────────
  const errori = [];
  if (!valore_nominale || valore_nominale <= 0) errori.push('Valore nominale non valido');
  if (!prezzo_acquisto || prezzo_acquisto <= 0)  errori.push('Prezzo acquisto non valido');
  if (!valore_recupero_stima || valore_recupero_stima < 0) errori.push('Valore recupero stimato non valido');
  if (errori.length > 0) return { applicabile: false, errori };

  // ── Calcoli base ────────────────────────────────────────────────────────
  const costi_totali     = (costi_legali_stima || 0) + (costi_gestione_stima || 0);
  const investimento_tot = prezzo_acquisto + costi_totali;

  // Haircut = (1 - prezzo/nominale)
  const haircut_pct = ((1 - prezzo_acquisto / valore_nominale) * 100);

  // Recovery rate = recupero / nominale
  const recovery_rate_pct = (valore_recupero_stima / valore_nominale * 100);

  // Profitto lordo
  const profitto_lordo = valore_recupero_stima - prezzo_acquisto;
  const profitto_netto = valore_recupero_stima - investimento_tot;

  // ROI lordo e netto
  const roi_lordo_pct = prezzo_acquisto > 0 ? (profitto_lordo / prezzo_acquisto * 100) : 0;
  const roi_netto_pct = investimento_tot > 0 ? (profitto_netto / investimento_tot * 100) : 0;

  // ROI annualizzato (CAGR semplificato)
  const anni = Math.max(0.5, parseFloat(anni_contenzioso) || 3);
  const roi_annualizzato_pct = anni > 0 ? (Math.pow(1 + roi_netto_pct / 100, 1 / anni) - 1) * 100 : 0;

  // Break-even price (massimo pagabile per roi_netto = 0)
  const breakeven_price = valore_recupero_stima - costi_totali;

  // Margine di sicurezza
  const margine_sicurezza_pct = breakeven_price > 0
    ? ((breakeven_price - prezzo_acquisto) / breakeven_price * 100)
    : 0;

  // ── Score opportunità 0-5 ────────────────────────────────────────────────
  // Fattori: ROI netto, tipo garanzia, anni, recovery rate, haircut
  let score = 0;

  // ROI netto
  if      (roi_netto_pct >= 50)  score += 2;
  else if (roi_netto_pct >= 25)  score += 1.5;
  else if (roi_netto_pct >= 10)  score += 1;
  else if (roi_netto_pct >= 0)   score += 0.5;
  else                            score += 0;

  // Garanzia
  const garanzia_score = { ipotecaria: 1.5, privilegiata: 1.0, chirografaria: 0.5, nessuna: 0 };
  score += garanzia_score[tipo_garanzia] || 0;

  // Anni contenzioso (meno anni = meglio)
  if      (anni <= 1) score += 1;
  else if (anni <= 2) score += 0.75;
  else if (anni <= 4) score += 0.5;
  else if (anni <= 6) score += 0.25;

  // Haircut (più alto = più sicuro in acquisto)
  if      (haircut_pct >= 70) score += 0.5;
  else if (haircut_pct >= 50) score += 0.25;

  score = Math.min(5, Math.round(score * 2) / 2); // arrotonda a 0.5, max 5

  // ── Label score ──────────────────────────────────────────────────────────
  const label_score = score >= 4   ? 'Opportunità eccellente'
                    : score >= 3   ? 'Opportunità buona'
                    : score >= 2   ? 'Opportunità discreta — monitorare'
                    : score >= 1   ? 'Opportunità debole — alto rischio'
                    :                'Operazione sconsigliata';

  // ── Fattori di rischio ───────────────────────────────────────────────────
  const fattori = [
    {
      id: 'N1', nome: 'Haircut sul Nominale',
      valore_label: haircut_pct.toFixed(1) + '% sconto',
      impatto: haircut_pct >= 60 ? 'Favorevole' : haircut_pct >= 40 ? 'Neutro' : 'Sfavorevole'
    },
    {
      id: 'N2', nome: 'Recovery Rate Stimato',
      valore_label: recovery_rate_pct.toFixed(1) + '% del nominale',
      impatto: recovery_rate_pct > 60 ? 'Favorevole' : recovery_rate_pct > 30 ? 'Neutro' : 'Sfavorevole'
    },
    {
      id: 'N3', nome: 'Tipo Garanzia',
      valore_label: _labelGaranzia(tipo_garanzia),
      impatto: tipo_garanzia === 'ipotecaria' ? 'Alto (garanzia reale)' : tipo_garanzia === 'chirografaria' ? 'Basso' : 'Medio'
    },
    {
      id: 'N4', nome: 'Anni Recupero Stimati',
      valore_label: anni.toFixed(1) + ' anni',
      impatto: anni <= 2 ? 'Favorevole' : anni <= 4 ? 'Neutro' : 'Sfavorevole (tempi lunghi)'
    },
    {
      id: 'N5', nome: 'Stato Pratica',
      valore_label: _labelStato(stato_pratica),
      impatto: stato_pratica === 'past_due' ? 'Favorevole' : stato_pratica === 'sofferenza' ? 'Neutro-basso' : 'Medio'
    },
    {
      id: 'N6', nome: 'Margine di Sicurezza',
      valore_label: margine_sicurezza_pct.toFixed(1) + '% (breakeven: €' + breakeven_price.toLocaleString('it-IT', {minimumFractionDigits:0}) + ')',
      impatto: margine_sicurezza_pct >= 20 ? 'Favorevole' : margine_sicurezza_pct >= 5 ? 'Neutro' : 'Rischio elevato'
    },
    {
      id: 'N7', nome: 'N° Debitori nel Pacchetto',
      valore_label: num_debitori + ' debitor' + (num_debitori === 1 ? 'e' : 'i'),
      impatto: num_debitori > 1 ? 'Diversificazione — riduce rischio concentrazione' : 'Singolo debitore'
    },
    {
      id: 'N8', nome: 'ROI Annualizzato (stimato)',
      valore_label: roi_annualizzato_pct.toFixed(2) + '% / anno',
      impatto: roi_annualizzato_pct >= 20 ? 'Eccellente' : roi_annualizzato_pct >= 10 ? 'Buono' : roi_annualizzato_pct >= 0 ? 'Accettabile' : 'Negativo'
    }
  ];

  const disclaimer = 'I valori sono stime indicative basate sui dati inseriti. Non sostituiscono la due diligence legale, finanziaria e peritale. I tempi e costi di recupero effettivi possono differire significativamente. Consultare un legale specializzato in NPL.';

  return {
    applicabile:            true,
    valore_nominale,
    prezzo_acquisto,
    valore_recupero_stima,
    costi_legali_stima,
    costi_gestione_stima,
    costi_totali,
    investimento_tot,
    haircut_pct,
    recovery_rate_pct,
    profitto_lordo,
    profitto_netto,
    roi_lordo_pct,
    roi_netto_pct,
    roi_annualizzato_pct,
    breakeven_price,
    margine_sicurezza_pct,
    anni_contenzioso:       anni,
    tipo_garanzia,
    stato_pratica,
    num_debitori,
    score,
    label_score,
    fattori,
    disclaimer,
    note: note || ''
  };
}

function _labelGaranzia(g) {
  const m = { ipotecaria: 'Ipotecaria (reale)', privilegiata: 'Privilegiata', chirografaria: 'Chirografaria', nessuna: 'Nessuna garanzia' };
  return m[g] || g;
}

function _labelStato(s) {
  const m = { sofferenza: 'Sofferenza', inadempienz_probab: 'Inadempienza Probabile', past_due: 'Past Due (scaduto)', ristrutturato: 'Ristrutturato' };
  return m[s] || s;
}

module.exports = { analizza_npl };
