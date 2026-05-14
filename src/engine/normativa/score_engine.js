/**
 * score_engine.js - Calcolo score rischio 0-4
 * Fix v1.1: delta calcolato in punti percentuali assoluti
 */

function calcola_score(teg, soglia, fattori_input) {

  const teg_perc    = teg    > 1 ? teg    : teg    * 100;
  const soglia_perc = soglia > 1 ? soglia : soglia * 100;
  const delta_pp    = teg_perc - soglia_perc;

  let score_base = 0;
  if (delta_pp <= 0)       score_base = 0;
  else if (delta_pp < 0.5) score_base = 1;
  else if (delta_pp < 2.0) score_base = 2;
  else                      score_base = 3;

  const polizza_condizionante = fattori_input.polizza_condizionante === true;
  const data_stipula = fattori_input.data_stipula || '';
  const anno_stipula = data_stipula ? parseInt(data_stipula.substring(0, 4)) : 0;
  const post_2010 = anno_stipula >= 2010;

  if (score_base === 3 && polizza_condizionante && post_2010) score_base = 4;

  const fattori = [
    { id:'F1', nome:'Delta vs Soglia', valore_raw: delta_pp,
      valore_label: delta_pp > 0 ? '+'+delta_pp.toFixed(2)+'pp (SOPRA SOGLIA)' : delta_pp.toFixed(2)+'pp (sotto soglia)',
      impatto: delta_pp > 2 ? 'Alto' : delta_pp > 0.5 ? 'Medio' : delta_pp > 0 ? 'Basso' : 'Nessuno' },
    { id:'F2', nome:'Polizza Condizionante', valore_raw: polizza_condizionante ? 1 : 0,
      valore_label: polizza_condizionante ? 'SI' : 'NO',
      impatto: polizza_condizionante ? 'Alto' : 'Nessuno' },
    { id:'F3', nome:'Epoca Contratto', valore_raw: anno_stipula,
      valore_label: anno_stipula >= 2017 ? 'Post-2017 (favorevole)' : anno_stipula >= 2010 ? '2010-2016' : anno_stipula > 0 ? 'Ante-2010 (orientamento diviso)' : 'Non specificata',
      impatto: anno_stipula >= 2010 ? 'Favorevole' : 'Diviso' },
    { id:'F4', nome:'Orientamento Giurisprudenziale', valore_raw: score_base,
      valore_label: score_base >= 3 ? 'FAVOREVOLE (Cass.8806/2017, App.Torino 53/2026)' : score_base >= 2 ? 'DIVISO' : 'Non rilevante',
      impatto: score_base >= 3 ? 'Alto' : 'Neutro' },
    { id:'F5', nome:'Moratori in Anomalia', valore_raw: fattori_input.moratori_anomalia ? 1 : 0,
      valore_label: fattori_input.moratori_anomalia ? 'SI' : 'Non verificato',
      impatto: fattori_input.moratori_anomalia ? 'Medio' : 'Neutro' },
    { id:'F6', nome:'Completezza Dati', valore_raw: fattori_input.completezza || 'alta',
      valore_label: fattori_input.completezza === 'bassa' ? 'Bassa - analisi meno affidabile' : fattori_input.completezza === 'media' ? 'Media' : 'Alta',
      impatto: fattori_input.completezza === 'bassa' ? 'Riduce affidabilita' : 'Neutro' }
  ];

  const affidabilita = fattori_input.completezza === 'bassa' ? 'bassa' : fattori_input.completezza === 'media' ? 'media' : 'alta';
  const score_labels = { 0:'Nessuna anomalia rilevata', 1:'Zona grigia - dati insufficienti', 2:'Anomalia possibile', 3:'Anomalia probabile', 4:'Caso forte per contenzioso' };
  const orientamento = score_base >= 3 ? 'FAVOREVOLE' : score_base >= 2 ? 'DIVISO' : 'Non rilevante';

  return { score: score_base, label: score_labels[score_base], fattori, affidabilita, delta_pp, teg_perc, soglia_perc, polizza_condizionante, orientamento_giurisp: orientamento };
}

module.exports = { calcola_score };