/**
 * BBRE Motore Normativo: Applicazione Regole
 * Legge le regole attive dal DB e filtra le voci di costo.
 */

function applica_regole(db, voci_costo) {
  // 1. Recupera regole attive dal DB
  const res = db.exec("SELECT codice_regola, descrizione, tipo_regola, parametri FROM regole_normative WHERE attiva = 1");
  const regole = {};
  
  if (res.length > 0) {
    res[0].values.forEach(row => {
      regole[row[0]] = { desc: row[1], tipo: row[2], params: JSON.parse(row[3]) };
    });
  }

  const risultato = [];
  let motivazione_globale = [];

  // 2. Processa ogni voce di costo
  voci_costo.forEach(voce => {
    let inclusa = true; // Default: principio di precauzione (includere se non esplicitamente escluso)
    let motivazione = "Inclusa di default (nessuna regola di esclusione applicabile)";
    let regola_id = null;

    // Logica specifica basata sui codici regola
    const nomeVoce = voce.voce.toLowerCase();

    // R001: Spese istruttoria (Sempre incluse)
    if (nomeVoce.includes('istruttoria') && regole['R001']) {
      inclusa = true;
      motivazione = regole['R001'].desc;
      regola_id = 'R001';
    }

    // R002: Polizze (Escluse se non obbligatorie)
    else if (nomeVoce.includes('polizza') && regole['R002']) {
      // Assumiamo che la voce abbia un flag 'obbligatoria' o lo deduciamo
      const eObbligatoria = voce.obbligatoria !== false; 
      if (!eObbligatoria) {
        inclusa = false;
        motivazione = "Polizza non obbligatoria, esclusa dal TEG (R002)";
        regola_id = 'R002';
      } else {
        motivazione = "Polizza obbligatoria, inclusa";
        regola_id = 'R002';
      }
    }

    // R003: CMS (Commissioni Massimo Scoperto) - Escluse dal TEG
    else if ((nomeVoce.includes('cms') || nomeVoce.includes('commissione massimo scoperto')) && regole['R003']) {
      inclusa = false;
      motivazione = "CMS escluso per legge (R003)";
      regola_id = 'R003';
    }

    risultato.push({
      ...voce,
      inclusa_teg: inclusa,
      motivazione: motivazione,
      regola_applicata: regola_id
    });
  });

  return {
    voci_processate: risultato,
    regole_applicate: Object.keys(regole)
  };
}

module.exports = { applica_regole };
