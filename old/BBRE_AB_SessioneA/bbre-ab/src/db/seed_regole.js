/**
 * BBRE Anomalie Bancarie — Seed regole normative
 * Eseguibile standalone: node src/db/seed_regole.js
 */

'use strict';

const { getDb, closeDb } = require('./db');

const REGOLE = [
  {
    codice: 'R001',
    titolo: 'Inclusione polizze condizionanti nel TEG (post-2010)',
    tipo: 'polizza',
    contenuto_testo: `Le polizze assicurative la cui sottoscrizione è condizione necessaria per 
l'ottenimento del finanziamento (polizze "condizionanti") devono essere incluse nel calcolo 
del TEG ai sensi della comunicazione Banca d'Italia del 3 luglio 2013. 
Il costo della polizza va ripartito per la durata del contratto e sommato agli altri oneri 
ai fini del calcolo del TEG effettivo. 
Questa regola si applica ai contratti stipulati a partire dal 1° aprile 2011.`,
    riferimento_normativo: `Banca d\'Italia, Comunicazione 3 luglio 2013; 
Circ. Banca d\'Italia 29 luglio 2009 (chiarimenti TEG); 
Cass. Civ. 8806/2017; Cass. Civ. 29501/2023`,
    data_inizio_validita: '2011-04-01',
    data_fine_validita: null,
    attiva: 1,
    versione: '1.0',
    note_redazionali: 'Orientamento consolidato. Applicazione praticamente certa in giudizio post-2011.'
  },
  {
    codice: 'R002',
    titolo: 'Polizze ante-2010: orientamento diviso',
    tipo: 'polizza',
    contenuto_testo: `Per i contratti stipulati prima del 1° aprile 2011, l'inclusione delle polizze 
condizionanti nel TEG è oggetto di orientamento giurisprudenziale non uniforme.
Orientamento favorevole (inclusione): sostiene che il principio di inclusione fosse già 
implicito nella normativa antiusura anche ante-2011.
Orientamento contrario (esclusione): Trib. Milano febbraio 2026 — principio di omogeneità: 
le voci di costo incluse nel TEG del contratto devono essere omogenee a quelle incluse 
nel TEGM pubblicato da Banca d\'Italia per il periodo di riferimento. Se Banca d\'Italia 
non includeva le polizze nel TEGM di quel periodo, non possono essere incluse nel TEG 
del contratto ai fini del confronto con la soglia.
SCORING: su contratti ante-2011 con polizze, ridurre score di 1 livello e segnalare con warning.`,
    riferimento_normativo: `Trib. Milano, febbraio 2026 (principio omogeneità); 
Cass. Civ. 29501/2023 (favorevole inclusione); 
ABF orientamenti vari`,
    data_inizio_validita: null,
    data_fine_validita: '2011-03-31',
    attiva: 1,
    versione: '1.0',
    note_redazionali: 'Orientamento diviso. Segnalare sempre come warning. Non determinante da solo.'
  },
  {
    codice: 'R003',
    titolo: 'Interessi moratori: soglia applicabile',
    tipo: 'moratori',
    contenuto_testo: `Gli interessi moratori sono soggetti alla normativa antiusura ma con modalità 
di calcolo della soglia specifiche.
Secondo l\'orientamento ABF (prevalente): la soglia applicabile agli interessi moratori 
è pari al tasso soglia usura del periodo + 2,1 punti percentuali (spread moratorio medio 
rilevato da Banca d\'Italia).
Formula: soglia_moratori = tasso_soglia_periodo + 2.1%
Se il tasso moratorio contrattuale supera soglia_moratori → anomalia moratori = true.
Nota: Cass. SS.UU. 18287/2024 ha chiarito che anche i moratori rientrano nell\'usura 
oggettiva se superiori alla soglia.`,
    riferimento_normativo: `ABF Collegio Roma, varie decisioni 2019-2023; 
Cass. SS.UU. 18287/2024; 
Banca d\'Italia, spread medio moratori 2,1pp`,
    data_inizio_validita: '2011-01-01',
    data_fine_validita: null,
    attiva: 1,
    versione: '1.0',
    note_redazionali: 'Applicare sempre la verifica moratori come check separato dal TEG.'
  },
  {
    codice: 'R004',
    titolo: 'Riferimenti giurisprudenziali favorevoli al debitore',
    tipo: 'scoring',
    contenuto_testo: `Principali precedenti favorevoli alla tesi dell\'anomalia bancaria:
- Cass. Civ. 8806/2017: polizze condizionanti incluse nel TEG anche ante-2013.
- Cass. Civ. 29501/2023: conferma inclusione polizze; chiarisce metodo di calcolo 
  dell\'incidenza annua.
- App. Torino 53/2026: riconosciuto recupero interessi non dovuti su contratto CQS 
  con polizze non dichiarate nel TEG; danno liquidato.
- ABF Collegio Coordinamento 77/2016: polizze CPI condizionanti → incluse nel TEG.
Questi precedenti rafforzano il valore negoziale del dossier pre-istruttorio 
nella fase di stralcio/NPL.`,
    riferimento_normativo: `Cass. 8806/2017; Cass. 29501/2023; App. Torino 53/2026; ABF 77/2016`,
    data_inizio_validita: '2017-01-01',
    data_fine_validita: null,
    attiva: 1,
    versione: '1.0',
    note_redazionali: 'Citare nei report come base giuridica. Non promettere esito processuale.'
  },
  {
    codice: 'R005',
    titolo: 'Riferimenti giurisprudenziali contrari / limitativi',
    tipo: 'scoring',
    contenuto_testo: `Principali precedenti sfavorevoli o limitativi:
- Trib. Milano, febbraio 2026: principio di omogeneità per contratti ante-2010. 
  Il confronto TEG/soglia deve usare metodologie di calcolo omogenee. Se Banca d\'Italia 
  non includeva polizze nel TEGM del periodo, non si possono includere nel TEG contrattuale.
  Impatto: riduce significativamente i casi ante-2010 con polizze.
- Cass. SS.UU. 16303/2018: usura sopravvenuta non determina nullità della clausola 
  (solo possibile sospensione degli interessi). Attenzione: diverso dall\'usura originaria.
- Trib. Roma, varie 2023-2024: onere probatorio elevato sul mutuatario per dimostrare 
  il carattere condizionante della polizza.
SCORING: la presenza di questi precedenti abbassa l\'affidabilità dell\'analisi 
su contratti pre-2010.`,
    riferimento_normativo: `Trib. Milano feb.2026; Cass. SS.UU. 16303/2018; Trib. Roma 2023-2024`,
    data_inizio_validita: null,
    data_fine_validita: null,
    attiva: 1,
    versione: '1.0',
    note_redazionali: 'Sempre citare nel report per correttezza del quadro. Tool è DSS, non oracolo.'
  },
  {
    codice: 'R006',
    titolo: 'Formula calcolo soglia usura post-2011',
    tipo: 'soglia',
    contenuto_testo: `Dal 14 maggio 2011 (L. 106/2011, conv. D.L. 70/2011) la formula di calcolo 
della soglia usura è cambiata:
VECCHIA (ante 2011): Soglia = TEGM × 1,5
NUOVA (post 2011):   Soglia = TEGM + (TEGM × 25%) + 4 punti percentuali
                     con vincolo: (Soglia - TEGM) ≤ 8 punti percentuali
Esempi:
- TEGM 5%  → Soglia = 5 + 1.25 + 4 = 10.25% (delta 5.25pp < 8pp → ok)
- TEGM 2%  → Soglia = 2 + 0.50 + 4 = 6.50%  (delta 4.50pp < 8pp → ok)
- TEGM 15% → Soglia calcolata = 15 + 3.75 + 4 = 22.75% ma delta = 7.75pp < 8pp → 22.75%
- TEGM 20% → Soglia calcolata = 20 + 5 + 4 = 29% ma delta = 9pp > 8pp → Soglia = 20 + 8 = 28%`,
    riferimento_normativo: `D.L. 70/2011 conv. L. 106/2011, art. 8 comma 5 lett. d; 
L. 108/1996 art. 2 comma 4 (testo vigente)`,
    data_inizio_validita: '2011-05-14',
    data_fine_validita: null,
    attiva: 1,
    versione: '1.0',
    note_redazionali: 'Fondamentale. Applicare la formula corretta in base alla data del contratto.'
  },
  {
    codice: 'R007',
    titolo: 'Commissioni di massimo scoperto (CMS) nel TEG',
    tipo: 'soglia',
    contenuto_testo: `Le Commissioni di Massimo Scoperto (CMS) rientrano nel calcolo del TEG 
secondo le Istruzioni Banca d\'Italia aggiornate.
Metodo: la CMS va ricondotta a tasso annuo e sommata agli altri oneri.
Per i conti correnti con apertura di credito: CMS trimestrale → annualizzare 
(CMS_trim × 4 / utilizzo_medio).
Attenzione: ante-2010 Banca d\'Italia non includeva CMS nel TEGM → applicare 
anche qui il principio di omogeneità (R002/R005 per analogia).`,
    riferimento_normativo: `Istruzioni Banca d\'Italia per la rilevazione TEGM (varie versioni); 
Cass. Civ. 12965/2016`,
    data_inizio_validita: '2010-01-01',
    data_fine_validita: null,
    attiva: 1,
    versione: '1.0',
    note_redazionali: 'Rilevante per finanziamenti aziendali con castelletto. Non per mutui semplici.'
  }
];

function run() {
  const db = getDb();

  const insert = db.prepare(`
    INSERT OR REPLACE INTO regole_normative (
      codice, titolo, tipo, contenuto_testo, riferimento_normativo,
      data_inizio_validita, data_fine_validita, attiva, versione, note_redazionali
    ) VALUES (
      @codice, @titolo, @tipo, @contenuto_testo, @riferimento_normativo,
      @data_inizio_validita, @data_fine_validita, @attiva, @versione, @note_redazionali
    )
  `);

  const seedAll = db.transaction(() => {
    let count = 0;
    for (const regola of REGOLE) {
      insert.run(regola);
      count++;
    }
    return count;
  });

  try {
    const count = seedAll();
    console.log(`✅ Seed regole normative completato — ${count} regole inserite`);
    // Verifica
    const result = db.prepare('SELECT codice, titolo FROM regole_normative ORDER BY codice').all();
    result.forEach(r => console.log(`   ${r.codice}: ${r.titolo}`));
  } catch (err) {
    console.error('❌ Seed regole fallito:', err.message);
    process.exit(1);
  } finally {
    closeDb();
  }
}

run();
