
/**
 * regole_engine.js - Motore regole da DB
 * FASE 2: Determina inclusione/esclusione voci costo
 * 
 * NOTA: Usiamo sql.js che ha API diversa da better-sqlite3
 */

function determina_inclusione_voci(db, voci, tipo_contratto) {
  console.log('📋 Determina inclusione voci...');
  
  // In sql.js usiamo db.exec() invece di prepare().all()
  const query = "SELECT * FROM regole_normative WHERE attiva = 1";
  const results = db.exec(query);
  
  // db.exec ritorna array di oggetti {columns: [...], values: [[...]]}
  let regole = [];
  if (results.length > 0) {
    const columns = results[0].columns;
    const values = results[0].values;
    
    // Convertiamo in array di oggetti
    regole = values.map(row => {
      const obj = {};
      columns.forEach((col, idx) => {
        obj[col] = row[idx];
      });
      return obj;
    });
  }
  
  console.log('Regole caricate:', regole.length);
  
  const risultati = [];

  for (const voce of voci) {
    let inclusa = true;
    let motivazione = 'Inclusa di default';
    let regola_id = null;

    // Applica regole di esclusione basate sul tipo di voce
    const voceLower = voce.voce.toLowerCase();
    
    for (const regola of regole) {
      try {
        const params = JSON.parse(regola.parametri || '{}');
        
        // R002: Polizze non obbligatorie -> escluse
        if (regola.codice_regola === 'R002' && regola.tipo_regola === 'esclusione') {
  if (voceLower.includes('polizza') || voceLower.includes('assicurazione')) {
    // Se la voce è già marcata inclusa_teg dall'utente, rispetta la scelta
    if (!voce.inclusa_teg && !params.obbligatoria) {
      inclusa = false;
              motivazione = `Esclusa: ${regola.descrizione}`;
              regola_id = regola.codice_regola;
              break;
            }
          }
        }
        
        // R003: CMS escluse
        if (regola.codice_regola === 'R003' && regola.tipo_regola === 'esclusione') {
          if (voceLower.includes('cms') || voceLower.includes('commissione massimo scoperto')) {
            inclusa = false;
            motivazione = `Esclusa: ${regola.descrizione}`;
            regola_id = regola.codice_regola;
            break;
          }
        }
      } catch (err) {
        console.warn(`⚠️ Errore parsing parametri regola ${regola.codice_regola}:`, err);
      }
    }

    risultati.push({
      voce: voce.voce,
      importo: voce.importo,
      inclusa_teg: inclusa,
      motivazione,
      regola_id
    });
  }

  console.log('✅ Voci analizzate:', risultati);
  return risultati;
}

module.exports = { determina_inclusione_voci };
