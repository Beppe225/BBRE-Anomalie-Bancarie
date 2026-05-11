/**
 * regole_engine.js - Motore regole da DB
 */

function determina_inclusione_voci(db, voci, tipo_contratto) {
  const regole = db.prepare("SELECT * FROM regole_normative WHERE attiva = 1").all();
  const risultati = [];

  for (const voce of voci) {
    let inclusa = true;
    let motivazione = 'Inclusa di default';
    let regola_id = null;

    // Applica regole di esclusione
    for (const regola of regole) {
      const params = JSON.parse(regola.parametri);

      if (regola.tipo_regola === 'esclusione') {
        // Esempio: Polizza non obbligatoria -> esclusa
        if (voce.voce.toLowerCase().includes('polizza') && !params.obbligatoria) {
          inclusa = false;
          motivazione = `Esclusa per regola ${regola.codice_regola}`;
          regola_id = regola.codice_regola;
          break;
        }
      }
    }

    risultati.push({
      voce: voce.voce,
      importo: voce.importo,
      inclusa,
      motivazione,
      regola_id
    });
  }

  return risultati;
}

module.exports = { determina_inclusione_voci };
