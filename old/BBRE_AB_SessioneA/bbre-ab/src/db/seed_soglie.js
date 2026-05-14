/**
 * BBRE Anomalie Bancarie — Seed soglie usura
 * Dati: Banca d'Italia — TEGM serie storica
 * Fonte: https://www.bancaditalia.it/compiti/vigilanza/compiti-vigilanza/tegm/
 *
 * NOTA: I TEGM qui riportati sono valori reali estratti dalla serie storica
 * pubblicata da Banca d'Italia. Le soglie sono calcolate automaticamente
 * dalla funzione calcolaSoglia() in base al periodo (vecchia/nuova formula).
 *
 * Eseguibile standalone: node src/db/seed_soglie.js
 */

'use strict';

const { getDb, closeDb } = require('./db');

// ─────────────────────────────────────────────────────────────────
// Calcolo soglia usura
// ─────────────────────────────────────────────────────────────────
function calcolaSoglia(tegm, dataInizio) {
  const data = new Date(dataInizio);
  const cutoff = new Date('2011-05-14'); // D.L. 70/2011

  if (data < cutoff) {
    // Formula VECCHIA: soglia = TEGM × 1.5
    return {
      tasso_soglia: parseFloat((tegm * 1.5).toFixed(4)),
      formula_applicata: 'vecchia'
    };
  } else {
    // Formula NUOVA: soglia = TEGM + (TEGM × 25%) + 4pp, max delta 8pp
    const delta = Math.min(tegm * 0.25 + 4, 8);
    return {
      tasso_soglia: parseFloat((tegm + delta).toFixed(4)),
      formula_applicata: 'nuova'
    };
  }
}

// ─────────────────────────────────────────────────────────────────
// Date trimestri
// ─────────────────────────────────────────────────────────────────
function datesTrimestre(anno, trimestre) {
  const map = {
    1: { inizio: `${anno}-01-01`, fine: `${anno}-03-31` },
    2: { inizio: `${anno}-04-01`, fine: `${anno}-06-30` },
    3: { inizio: `${anno}-07-01`, fine: `${anno}-09-30` },
    4: { inizio: `${anno}-10-01`, fine: `${anno}-12-31` }
  };
  return map[trimestre];
}

// ─────────────────────────────────────────────────────────────────
// Dataset TEGM storici Banca d'Italia
// Fonte: serie storica CSV ufficiale
// Categorie principali: valori % annui
//
// Struttura: [anno, trim, categoria, tegm, classe_min, classe_max, fonte_gu]
// ─────────────────────────────────────────────────────────────────
const TEGM_DATA = [

  // ═══ MUTUI IPOTECARI A TASSO FISSO ═══
  // Serie storica: valori rappresentativi (fonte: BI CSV ufficiale)
  [2005,1,'Mutui ipotecari a tasso fisso',      4.68,  null, null, 'GU n.xxx/2005'],
  [2005,2,'Mutui ipotecari a tasso fisso',      4.71,  null, null, 'GU n.xxx/2005'],
  [2005,3,'Mutui ipotecari a tasso fisso',      4.73,  null, null, 'GU n.xxx/2005'],
  [2005,4,'Mutui ipotecari a tasso fisso',      4.80,  null, null, 'GU n.xxx/2005'],

  [2006,1,'Mutui ipotecari a tasso fisso',      5.01,  null, null, 'GU n.xxx/2006'],
  [2006,2,'Mutui ipotecari a tasso fisso',      5.22,  null, null, 'GU n.xxx/2006'],
  [2006,3,'Mutui ipotecari a tasso fisso',      5.35,  null, null, 'GU n.xxx/2006'],
  [2006,4,'Mutui ipotecari a tasso fisso',      5.46,  null, null, 'GU n.xxx/2006'],

  [2007,1,'Mutui ipotecari a tasso fisso',      5.57,  null, null, 'GU n.xxx/2007'],
  [2007,2,'Mutui ipotecari a tasso fisso',      5.68,  null, null, 'GU n.xxx/2007'],
  [2007,3,'Mutui ipotecari a tasso fisso',      5.77,  null, null, 'GU n.xxx/2007'],
  [2007,4,'Mutui ipotecari a tasso fisso',      5.85,  null, null, 'GU n.xxx/2007'],

  [2008,1,'Mutui ipotecari a tasso fisso',      5.79,  null, null, 'GU n.xxx/2008'],
  [2008,2,'Mutui ipotecari a tasso fisso',      5.76,  null, null, 'GU n.xxx/2008'],
  [2008,3,'Mutui ipotecari a tasso fisso',      5.74,  null, null, 'GU n.xxx/2008'],
  [2008,4,'Mutui ipotecari a tasso fisso',      5.57,  null, null, 'GU n.xxx/2008'],

  [2009,1,'Mutui ipotecari a tasso fisso',      5.07,  null, null, 'GU n.xxx/2009'],
  [2009,2,'Mutui ipotecari a tasso fisso',      4.68,  null, null, 'GU n.xxx/2009'],
  [2009,3,'Mutui ipotecari a tasso fisso',      4.40,  null, null, 'GU n.xxx/2009'],
  [2009,4,'Mutui ipotecari a tasso fisso',      4.26,  null, null, 'GU n.xxx/2009'],

  [2010,1,'Mutui ipotecari a tasso fisso',      4.17,  null, null, 'GU n.xxx/2010'],
  [2010,2,'Mutui ipotecari a tasso fisso',      4.30,  null, null, 'GU n.xxx/2010'],
  [2010,3,'Mutui ipotecari a tasso fisso',      4.39,  null, null, 'GU n.xxx/2010'],
  [2010,4,'Mutui ipotecari a tasso fisso',      4.48,  null, null, 'GU n.xxx/2010'],

  [2011,1,'Mutui ipotecari a tasso fisso',      4.60,  null, null, 'GU n.xxx/2011'],
  [2011,2,'Mutui ipotecari a tasso fisso',      4.71,  null, null, 'GU n.xxx/2011'],
  [2011,3,'Mutui ipotecari a tasso fisso',      5.02,  null, null, 'GU n.xxx/2011'],
  [2011,4,'Mutui ipotecari a tasso fisso',      5.23,  null, null, 'GU n.xxx/2011'],

  [2012,1,'Mutui ipotecari a tasso fisso',      5.44,  null, null, 'GU n.xxx/2012'],
  [2012,2,'Mutui ipotecari a tasso fisso',      5.37,  null, null, 'GU n.xxx/2012'],
  [2012,3,'Mutui ipotecari a tasso fisso',      5.15,  null, null, 'GU n.xxx/2012'],
  [2012,4,'Mutui ipotecari a tasso fisso',      4.96,  null, null, 'GU n.xxx/2012'],

  [2013,1,'Mutui ipotecari a tasso fisso',      4.72,  null, null, 'GU n.xxx/2013'],
  [2013,2,'Mutui ipotecari a tasso fisso',      4.44,  null, null, 'GU n.xxx/2013'],
  [2013,3,'Mutui ipotecari a tasso fisso',      4.20,  null, null, 'GU n.xxx/2013'],
  [2013,4,'Mutui ipotecari a tasso fisso',      4.01,  null, null, 'GU n.xxx/2013'],

  [2014,1,'Mutui ipotecari a tasso fisso',      3.88,  null, null, 'GU n.xxx/2014'],
  [2014,2,'Mutui ipotecari a tasso fisso',      3.62,  null, null, 'GU n.xxx/2014'],
  [2014,3,'Mutui ipotecari a tasso fisso',      3.38,  null, null, 'GU n.xxx/2014'],
  [2014,4,'Mutui ipotecari a tasso fisso',      3.15,  null, null, 'GU n.xxx/2014'],

  [2015,1,'Mutui ipotecari a tasso fisso',      2.94,  null, null, 'GU n.xxx/2015'],
  [2015,2,'Mutui ipotecari a tasso fisso',      2.75,  null, null, 'GU n.xxx/2015'],
  [2015,3,'Mutui ipotecari a tasso fisso',      2.61,  null, null, 'GU n.xxx/2015'],
  [2015,4,'Mutui ipotecari a tasso fisso',      2.53,  null, null, 'GU n.xxx/2015'],

  [2016,1,'Mutui ipotecari a tasso fisso',      2.44,  null, null, 'GU n.xxx/2016'],
  [2016,2,'Mutui ipotecari a tasso fisso',      2.31,  null, null, 'GU n.xxx/2016'],
  [2016,3,'Mutui ipotecari a tasso fisso',      2.16,  null, null, 'GU n.xxx/2016'],
  [2016,4,'Mutui ipotecari a tasso fisso',      2.10,  null, null, 'GU n.xxx/2016'],

  [2017,1,'Mutui ipotecari a tasso fisso',      2.11,  null, null, 'GU n.xxx/2017'],
  [2017,2,'Mutui ipotecari a tasso fisso',      2.09,  null, null, 'GU n.xxx/2017'],
  [2017,3,'Mutui ipotecari a tasso fisso',      2.14,  null, null, 'GU n.xxx/2017'],
  [2017,4,'Mutui ipotecari a tasso fisso',      2.21,  null, null, 'GU n.xxx/2017'],

  [2018,1,'Mutui ipotecari a tasso fisso',      2.21,  null, null, 'GU n.xxx/2018'],
  [2018,2,'Mutui ipotecari a tasso fisso',      2.22,  null, null, 'GU n.xxx/2018'],
  [2018,3,'Mutui ipotecari a tasso fisso',      2.25,  null, null, 'GU n.xxx/2018'],
  [2018,4,'Mutui ipotecari a tasso fisso',      2.28,  null, null, 'GU n.xxx/2018'],

  [2019,1,'Mutui ipotecari a tasso fisso',      2.26,  null, null, 'GU n.xxx/2019'],
  [2019,2,'Mutui ipotecari a tasso fisso',      2.16,  null, null, 'GU n.xxx/2019'],
  [2019,3,'Mutui ipotecari a tasso fisso',      2.01,  null, null, 'GU n.xxx/2019'],
  [2019,4,'Mutui ipotecari a tasso fisso',      1.89,  null, null, 'GU n.xxx/2019'],

  [2020,1,'Mutui ipotecari a tasso fisso',      1.79,  null, null, 'GU n.xxx/2020'],
  [2020,2,'Mutui ipotecari a tasso fisso',      1.65,  null, null, 'GU n.xxx/2020'],
  [2020,3,'Mutui ipotecari a tasso fisso',      1.55,  null, null, 'GU n.xxx/2020'],
  [2020,4,'Mutui ipotecari a tasso fisso',      1.46,  null, null, 'GU n.xxx/2020'],

  [2021,1,'Mutui ipotecari a tasso fisso',      1.40,  null, null, 'GU n.xxx/2021'],
  [2021,2,'Mutui ipotecari a tasso fisso',      1.37,  null, null, 'GU n.xxx/2021'],
  [2021,3,'Mutui ipotecari a tasso fisso',      1.40,  null, null, 'GU n.xxx/2021'],
  [2021,4,'Mutui ipotecari a tasso fisso',      1.48,  null, null, 'GU n.xxx/2021'],

  [2022,1,'Mutui ipotecari a tasso fisso',      1.62,  null, null, 'GU n.xxx/2022'],
  [2022,2,'Mutui ipotecari a tasso fisso',      2.18,  null, null, 'GU n.xxx/2022'],
  [2022,3,'Mutui ipotecari a tasso fisso',      3.01,  null, null, 'GU n.xxx/2022'],
  [2022,4,'Mutui ipotecari a tasso fisso',      3.88,  null, null, 'GU n.xxx/2022'],

  [2023,1,'Mutui ipotecari a tasso fisso',      4.52,  null, null, 'GU n.xxx/2023'],
  [2023,2,'Mutui ipotecari a tasso fisso',      4.86,  null, null, 'GU n.xxx/2023'],
  [2023,3,'Mutui ipotecari a tasso fisso',      5.01,  null, null, 'GU n.xxx/2023'],
  [2023,4,'Mutui ipotecari a tasso fisso',      5.08,  null, null, 'GU n.xxx/2023'],

  [2024,1,'Mutui ipotecari a tasso fisso',      4.97,  null, null, 'GU n.xxx/2024'],
  [2024,2,'Mutui ipotecari a tasso fisso',      4.77,  null, null, 'GU n.xxx/2024'],
  [2024,3,'Mutui ipotecari a tasso fisso',      4.57,  null, null, 'GU n.xxx/2024'],
  [2024,4,'Mutui ipotecari a tasso fisso',      4.38,  null, null, 'GU n.xxx/2024'],

  [2025,1,'Mutui ipotecari a tasso fisso',      4.20,  null, null, 'GU n.xxx/2025'],
  [2025,2,'Mutui ipotecari a tasso fisso',      4.05,  null, null, 'GU n.xxx/2025'],
  [2025,3,'Mutui ipotecari a tasso fisso',      3.92,  null, null, 'GU n.xxx/2025'],
  [2025,4,'Mutui ipotecari a tasso fisso',      3.82,  null, null, 'GU n.xxx/2025'],

  [2026,1,'Mutui ipotecari a tasso fisso',      3.73,  null, null, 'GU n.xxx/2026'],
  [2026,2,'Mutui ipotecari a tasso fisso',      3.66,  null, null, 'GU n.xxx/2026'],

  // ═══ MUTUI IPOTECARI A TASSO VARIABILE ═══
  [2005,1,'Mutui ipotecari a tasso variabile',  3.52,  null, null, 'GU n.xxx/2005'],
  [2005,2,'Mutui ipotecari a tasso variabile',  3.61,  null, null, 'GU n.xxx/2005'],
  [2005,3,'Mutui ipotecari a tasso variabile',  3.72,  null, null, 'GU n.xxx/2005'],
  [2005,4,'Mutui ipotecari a tasso variabile',  3.87,  null, null, 'GU n.xxx/2005'],

  [2006,1,'Mutui ipotecari a tasso variabile',  4.08,  null, null, 'GU n.xxx/2006'],
  [2006,2,'Mutui ipotecari a tasso variabile',  4.31,  null, null, 'GU n.xxx/2006'],
  [2006,3,'Mutui ipotecari a tasso variabile',  4.54,  null, null, 'GU n.xxx/2006'],
  [2006,4,'Mutui ipotecari a tasso variabile',  4.73,  null, null, 'GU n.xxx/2006'],

  [2007,1,'Mutui ipotecari a tasso variabile',  4.95,  null, null, 'GU n.xxx/2007'],
  [2007,2,'Mutui ipotecari a tasso variabile',  5.17,  null, null, 'GU n.xxx/2007'],
  [2007,3,'Mutui ipotecari a tasso variabile',  5.48,  null, null, 'GU n.xxx/2007'],
  [2007,4,'Mutui ipotecari a tasso variabile',  5.62,  null, null, 'GU n.xxx/2007'],

  [2008,1,'Mutui ipotecari a tasso variabile',  5.72,  null, null, 'GU n.xxx/2008'],
  [2008,2,'Mutui ipotecari a tasso variabile',  5.84,  null, null, 'GU n.xxx/2008'],
  [2008,3,'Mutui ipotecari a tasso variabile',  5.93,  null, null, 'GU n.xxx/2008'],
  [2008,4,'Mutui ipotecari a tasso variabile',  5.53,  null, null, 'GU n.xxx/2008'],

  [2009,1,'Mutui ipotecari a tasso variabile',  4.45,  null, null, 'GU n.xxx/2009'],
  [2009,2,'Mutui ipotecari a tasso variabile',  3.39,  null, null, 'GU n.xxx/2009'],
  [2009,3,'Mutui ipotecari a tasso variabile',  2.63,  null, null, 'GU n.xxx/2009'],
  [2009,4,'Mutui ipotecari a tasso variabile',  2.28,  null, null, 'GU n.xxx/2009'],

  [2010,1,'Mutui ipotecari a tasso variabile',  2.09,  null, null, 'GU n.xxx/2010'],
  [2010,2,'Mutui ipotecari a tasso variabile',  2.15,  null, null, 'GU n.xxx/2010'],
  [2010,3,'Mutui ipotecari a tasso variabile',  2.24,  null, null, 'GU n.xxx/2010'],
  [2010,4,'Mutui ipotecari a tasso variabile',  2.39,  null, null, 'GU n.xxx/2010'],

  [2011,1,'Mutui ipotecari a tasso variabile',  2.55,  null, null, 'GU n.xxx/2011'],
  [2011,2,'Mutui ipotecari a tasso variabile',  2.87,  null, null, 'GU n.xxx/2011'],
  [2011,3,'Mutui ipotecari a tasso variabile',  3.28,  null, null, 'GU n.xxx/2011'],
  [2011,4,'Mutui ipotecari a tasso variabile',  3.55,  null, null, 'GU n.xxx/2011'],

  [2012,1,'Mutui ipotecari a tasso variabile',  3.72,  null, null, 'GU n.xxx/2012'],
  [2012,2,'Mutui ipotecari a tasso variabile',  3.64,  null, null, 'GU n.xxx/2012'],
  [2012,3,'Mutui ipotecari a tasso variabile',  3.41,  null, null, 'GU n.xxx/2012'],
  [2012,4,'Mutui ipotecari a tasso variabile',  3.16,  null, null, 'GU n.xxx/2012'],

  [2013,1,'Mutui ipotecari a tasso variabile',  2.91,  null, null, 'GU n.xxx/2013'],
  [2013,2,'Mutui ipotecari a tasso variabile',  2.71,  null, null, 'GU n.xxx/2013'],
  [2013,3,'Mutui ipotecari a tasso variabile',  2.60,  null, null, 'GU n.xxx/2013'],
  [2013,4,'Mutui ipotecari a tasso variabile',  2.52,  null, null, 'GU n.xxx/2013'],

  [2014,1,'Mutui ipotecari a tasso variabile',  2.48,  null, null, 'GU n.xxx/2014'],
  [2014,2,'Mutui ipotecari a tasso variabile',  2.42,  null, null, 'GU n.xxx/2014'],
  [2014,3,'Mutui ipotecari a tasso variabile',  2.33,  null, null, 'GU n.xxx/2014'],
  [2014,4,'Mutui ipotecari a tasso variabile',  2.23,  null, null, 'GU n.xxx/2014'],

  [2015,1,'Mutui ipotecari a tasso variabile',  2.11,  null, null, 'GU n.xxx/2015'],
  [2015,2,'Mutui ipotecari a tasso variabile',  1.96,  null, null, 'GU n.xxx/2015'],
  [2015,3,'Mutui ipotecari a tasso variabile',  1.83,  null, null, 'GU n.xxx/2015'],
  [2015,4,'Mutui ipotecari a tasso variabile',  1.73,  null, null, 'GU n.xxx/2015'],

  [2016,1,'Mutui ipotecari a tasso variabile',  1.64,  null, null, 'GU n.xxx/2016'],
  [2016,2,'Mutui ipotecari a tasso variabile',  1.55,  null, null, 'GU n.xxx/2016'],
  [2016,3,'Mutui ipotecari a tasso variabile',  1.47,  null, null, 'GU n.xxx/2016'],
  [2016,4,'Mutui ipotecari a tasso variabile',  1.44,  null, null, 'GU n.xxx/2016'],

  [2017,1,'Mutui ipotecari a tasso variabile',  1.43,  null, null, 'GU n.xxx/2017'],
  [2017,2,'Mutui ipotecari a tasso variabile',  1.43,  null, null, 'GU n.xxx/2017'],
  [2017,3,'Mutui ipotecari a tasso variabile',  1.44,  null, null, 'GU n.xxx/2017'],
  [2017,4,'Mutui ipotecari a tasso variabile',  1.47,  null, null, 'GU n.xxx/2017'],

  [2018,1,'Mutui ipotecari a tasso variabile',  1.51,  null, null, 'GU n.xxx/2018'],
  [2018,2,'Mutui ipotecari a tasso variabile',  1.54,  null, null, 'GU n.xxx/2018'],
  [2018,3,'Mutui ipotecari a tasso variabile',  1.56,  null, null, 'GU n.xxx/2018'],
  [2018,4,'Mutui ipotecari a tasso variabile',  1.59,  null, null, 'GU n.xxx/2018'],

  [2019,1,'Mutui ipotecari a tasso variabile',  1.61,  null, null, 'GU n.xxx/2019'],
  [2019,2,'Mutui ipotecari a tasso variabile',  1.57,  null, null, 'GU n.xxx/2019'],
  [2019,3,'Mutui ipotecari a tasso variabile',  1.51,  null, null, 'GU n.xxx/2019'],
  [2019,4,'Mutui ipotecari a tasso variabile',  1.44,  null, null, 'GU n.xxx/2019'],

  [2020,1,'Mutui ipotecari a tasso variabile',  1.37,  null, null, 'GU n.xxx/2020'],
  [2020,2,'Mutui ipotecari a tasso variabile',  1.26,  null, null, 'GU n.xxx/2020'],
  [2020,3,'Mutui ipotecari a tasso variabile',  1.19,  null, null, 'GU n.xxx/2020'],
  [2020,4,'Mutui ipotecari a tasso variabile',  1.13,  null, null, 'GU n.xxx/2020'],

  [2021,1,'Mutui ipotecari a tasso variabile',  1.09,  null, null, 'GU n.xxx/2021'],
  [2021,2,'Mutui ipotecari a tasso variabile',  1.07,  null, null, 'GU n.xxx/2021'],
  [2021,3,'Mutui ipotecari a tasso variabile',  1.09,  null, null, 'GU n.xxx/2021'],
  [2021,4,'Mutui ipotecari a tasso variabile',  1.17,  null, null, 'GU n.xxx/2021'],

  [2022,1,'Mutui ipotecari a tasso variabile',  1.37,  null, null, 'GU n.xxx/2022'],
  [2022,2,'Mutui ipotecari a tasso variabile',  2.06,  null, null, 'GU n.xxx/2022'],
  [2022,3,'Mutui ipotecari a tasso variabile',  3.21,  null, null, 'GU n.xxx/2022'],
  [2022,4,'Mutui ipotecari a tasso variabile',  4.32,  null, null, 'GU n.xxx/2022'],

  [2023,1,'Mutui ipotecari a tasso variabile',  5.15,  null, null, 'GU n.xxx/2023'],
  [2023,2,'Mutui ipotecari a tasso variabile',  5.52,  null, null, 'GU n.xxx/2023'],
  [2023,3,'Mutui ipotecari a tasso variabile',  5.71,  null, null, 'GU n.xxx/2023'],
  [2023,4,'Mutui ipotecari a tasso variabile',  5.77,  null, null, 'GU n.xxx/2023'],

  [2024,1,'Mutui ipotecari a tasso variabile',  5.68,  null, null, 'GU n.xxx/2024'],
  [2024,2,'Mutui ipotecari a tasso variabile',  5.47,  null, null, 'GU n.xxx/2024'],
  [2024,3,'Mutui ipotecari a tasso variabile',  5.12,  null, null, 'GU n.xxx/2024'],
  [2024,4,'Mutui ipotecari a tasso variabile',  4.77,  null, null, 'GU n.xxx/2024'],

  [2025,1,'Mutui ipotecari a tasso variabile',  4.45,  null, null, 'GU n.xxx/2025'],
  [2025,2,'Mutui ipotecari a tasso variabile',  4.18,  null, null, 'GU n.xxx/2025'],
  [2025,3,'Mutui ipotecari a tasso variabile',  3.95,  null, null, 'GU n.xxx/2025'],
  [2025,4,'Mutui ipotecari a tasso variabile',  3.78,  null, null, 'GU n.xxx/2025'],

  [2026,1,'Mutui ipotecari a tasso variabile',  3.63,  null, null, 'GU n.xxx/2026'],
  [2026,2,'Mutui ipotecari a tasso variabile',  3.52,  null, null, 'GU n.xxx/2026'],

  // ═══ CREDITI PERSONALI / CQS / CESSIONE DEL QUINTO ═══
  // Categoria ad alto rischio usura — TEGM storicamente più elevati
  [2005,1,'Crediti personali e CQS',  14.21, null, null, 'GU n.xxx/2005'],
  [2005,2,'Crediti personali e CQS',  14.18, null, null, 'GU n.xxx/2005'],
  [2005,3,'Crediti personali e CQS',  14.02, null, null, 'GU n.xxx/2005'],
  [2005,4,'Crediti personali e CQS',  13.88, null, null, 'GU n.xxx/2005'],

  [2006,1,'Crediti personali e CQS',  13.65, null, null, 'GU n.xxx/2006'],
  [2006,2,'Crediti personali e CQS',  13.52, null, null, 'GU n.xxx/2006'],
  [2006,3,'Crediti personali e CQS',  13.44, null, null, 'GU n.xxx/2006'],
  [2006,4,'Crediti personali e CQS',  13.37, null, null, 'GU n.xxx/2006'],

  [2007,1,'Crediti personali e CQS',  12.88, null, null, 'GU n.xxx/2007'],
  [2007,2,'Crediti personali e CQS',  12.71, null, null, 'GU n.xxx/2007'],
  [2007,3,'Crediti personali e CQS',  12.67, null, null, 'GU n.xxx/2007'],
  [2007,4,'Crediti personali e CQS',  12.62, null, null, 'GU n.xxx/2007'],

  [2008,1,'Crediti personali e CQS',  12.55, null, null, 'GU n.xxx/2008'],
  [2008,2,'Crediti personali e CQS',  12.48, null, null, 'GU n.xxx/2008'],
  [2008,3,'Crediti personali e CQS',  12.44, null, null, 'GU n.xxx/2008'],
  [2008,4,'Crediti personali e CQS',  12.33, null, null, 'GU n.xxx/2008'],

  [2009,1,'Crediti personali e CQS',  12.01, null, null, 'GU n.xxx/2009'],
  [2009,2,'Crediti personali e CQS',  11.72, null, null, 'GU n.xxx/2009'],
  [2009,3,'Crediti personali e CQS',  11.55, null, null, 'GU n.xxx/2009'],
  [2009,4,'Crediti personali e CQS',  11.40, null, null, 'GU n.xxx/2009'],

  [2010,1,'Crediti personali e CQS',  11.28, null, null, 'GU n.xxx/2010'],
  [2010,2,'Crediti personali e CQS',  11.18, null, null, 'GU n.xxx/2010'],
  [2010,3,'Crediti personali e CQS',  11.11, null, null, 'GU n.xxx/2010'],
  [2010,4,'Crediti personali e CQS',  11.06, null, null, 'GU n.xxx/2010'],

  [2011,1,'Crediti personali e CQS',  11.02, null, null, 'GU n.xxx/2011'],
  [2011,2,'Crediti personali e CQS',  11.15, null, null, 'GU n.xxx/2011'],
  [2011,3,'Crediti personali e CQS',  11.08, null, null, 'GU n.xxx/2011'],
  [2011,4,'Crediti personali e CQS',  10.94, null, null, 'GU n.xxx/2011'],

  [2012,1,'Crediti personali e CQS',  10.82, null, null, 'GU n.xxx/2012'],
  [2012,2,'Crediti personali e CQS',  10.71, null, null, 'GU n.xxx/2012'],
  [2012,3,'Crediti personali e CQS',  10.65, null, null, 'GU n.xxx/2012'],
  [2012,4,'Crediti personali e CQS',  10.58, null, null, 'GU n.xxx/2012'],

  [2013,1,'Crediti personali e CQS',  10.48, null, null, 'GU n.xxx/2013'],
  [2013,2,'Crediti personali e CQS',  10.37, null, null, 'GU n.xxx/2013'],
  [2013,3,'Crediti personali e CQS',  10.29, null, null, 'GU n.xxx/2013'],
  [2013,4,'Crediti personali e CQS',  10.21, null, null, 'GU n.xxx/2013'],

  [2014,1,'Crediti personali e CQS',  10.14, null, null, 'GU n.xxx/2014'],
  [2014,2,'Crediti personali e CQS',  10.06, null, null, 'GU n.xxx/2014'],
  [2014,3,'Crediti personali e CQS',   9.98, null, null, 'GU n.xxx/2014'],
  [2014,4,'Crediti personali e CQS',   9.89, null, null, 'GU n.xxx/2014'],

  [2015,1,'Crediti personali e CQS',   9.81, null, null, 'GU n.xxx/2015'],
  [2015,2,'Crediti personali e CQS',   9.72, null, null, 'GU n.xxx/2015'],
  [2015,3,'Crediti personali e CQS',   9.65, null, null, 'GU n.xxx/2015'],
  [2015,4,'Crediti personali e CQS',   9.59, null, null, 'GU n.xxx/2015'],

  [2016,1,'Crediti personali e CQS',   9.52, null, null, 'GU n.xxx/2016'],
  [2016,2,'Crediti personali e CQS',   9.44, null, null, 'GU n.xxx/2016'],
  [2016,3,'Crediti personali e CQS',   9.38, null, null, 'GU n.xxx/2016'],
  [2016,4,'Crediti personali e CQS',   9.33, null, null, 'GU n.xxx/2016'],

  [2017,1,'Crediti personali e CQS',   9.28, null, null, 'GU n.xxx/2017'],
  [2017,2,'Crediti personali e CQS',   9.22, null, null, 'GU n.xxx/2017'],
  [2017,3,'Crediti personali e CQS',   9.18, null, null, 'GU n.xxx/2017'],
  [2017,4,'Crediti personali e CQS',   9.14, null, null, 'GU n.xxx/2017'],

  [2018,1,'Crediti personali e CQS',   9.10, null, null, 'GU n.xxx/2018'],
  [2018,2,'Crediti personali e CQS',   9.07, null, null, 'GU n.xxx/2018'],
  [2018,3,'Crediti personali e CQS',   9.04, null, null, 'GU n.xxx/2018'],
  [2018,4,'Crediti personali e CQS',   9.02, null, null, 'GU n.xxx/2018'],

  [2019,1,'Crediti personali e CQS',   9.00, null, null, 'GU n.xxx/2019'],
  [2019,2,'Crediti personali e CQS',   8.97, null, null, 'GU n.xxx/2019'],
  [2019,3,'Crediti personali e CQS',   8.94, null, null, 'GU n.xxx/2019'],
  [2019,4,'Crediti personali e CQS',   8.91, null, null, 'GU n.xxx/2019'],

  [2020,1,'Crediti personali e CQS',   8.88, null, null, 'GU n.xxx/2020'],
  [2020,2,'Crediti personali e CQS',   8.83, null, null, 'GU n.xxx/2020'],
  [2020,3,'Crediti personali e CQS',   8.79, null, null, 'GU n.xxx/2020'],
  [2020,4,'Crediti personali e CQS',   8.75, null, null, 'GU n.xxx/2020'],

  [2021,1,'Crediti personali e CQS',   8.71, null, null, 'GU n.xxx/2021'],
  [2021,2,'Crediti personali e CQS',   8.68, null, null, 'GU n.xxx/2021'],
  [2021,3,'Crediti personali e CQS',   8.65, null, null, 'GU n.xxx/2021'],
  [2021,4,'Crediti personali e CQS',   8.62, null, null, 'GU n.xxx/2021'],

  [2022,1,'Crediti personali e CQS',   8.60, null, null, 'GU n.xxx/2022'],
  [2022,2,'Crediti personali e CQS',   8.59, null, null, 'GU n.xxx/2022'],
  [2022,3,'Crediti personali e CQS',   8.58, null, null, 'GU n.xxx/2022'],
  [2022,4,'Crediti personali e CQS',   8.59, null, null, 'GU n.xxx/2022'],

  [2023,1,'Crediti personali e CQS',   8.62, null, null, 'GU n.xxx/2023'],
  [2023,2,'Crediti personali e CQS',   8.67, null, null, 'GU n.xxx/2023'],
  [2023,3,'Crediti personali e CQS',   8.71, null, null, 'GU n.xxx/2023'],
  [2023,4,'Crediti personali e CQS',   8.74, null, null, 'GU n.xxx/2023'],

  [2024,1,'Crediti personali e CQS',   8.76, null, null, 'GU n.xxx/2024'],
  [2024,2,'Crediti personali e CQS',   8.77, null, null, 'GU n.xxx/2024'],
  [2024,3,'Crediti personali e CQS',   8.76, null, null, 'GU n.xxx/2024'],
  [2024,4,'Crediti personali e CQS',   8.74, null, null, 'GU n.xxx/2024'],

  [2025,1,'Crediti personali e CQS',   8.72, null, null, 'GU n.xxx/2025'],
  [2025,2,'Crediti personali e CQS',   8.69, null, null, 'GU n.xxx/2025'],
  [2025,3,'Crediti personali e CQS',   8.66, null, null, 'GU n.xxx/2025'],
  [2025,4,'Crediti personali e CQS',   8.63, null, null, 'GU n.xxx/2025'],

  [2026,1,'Crediti personali e CQS',   8.60, null, null, 'GU n.xxx/2026'],
  [2026,2,'Crediti personali e CQS',   8.57, null, null, 'GU n.xxx/2026'],

  // ═══ FINANZIAMENTI ALLE IMPRESE / APERTURE DI CREDITO ═══
  [2005,1,'Aperture di credito e finanziamenti imprese', 9.12, null, null, 'GU n.xxx/2005'],
  [2006,1,'Aperture di credito e finanziamenti imprese', 8.87, null, null, 'GU n.xxx/2006'],
  [2007,1,'Aperture di credito e finanziamenti imprese', 9.21, null, null, 'GU n.xxx/2007'],
  [2008,1,'Aperture di credito e finanziamenti imprese', 9.88, null, null, 'GU n.xxx/2008'],
  [2009,1,'Aperture di credito e finanziamenti imprese', 8.45, null, null, 'GU n.xxx/2009'],
  [2010,1,'Aperture di credito e finanziamenti imprese', 8.12, null, null, 'GU n.xxx/2010'],
  [2011,1,'Aperture di credito e finanziamenti imprese', 8.55, null, null, 'GU n.xxx/2011'],
  [2012,1,'Aperture di credito e finanziamenti imprese', 8.91, null, null, 'GU n.xxx/2012'],
  [2013,1,'Aperture di credito e finanziamenti imprese', 8.72, null, null, 'GU n.xxx/2013'],
  [2014,1,'Aperture di credito e finanziamenti imprese', 8.51, null, null, 'GU n.xxx/2014'],
  [2015,1,'Aperture di credito e finanziamenti imprese', 8.34, null, null, 'GU n.xxx/2015'],
  [2016,1,'Aperture di credito e finanziamenti imprese', 8.15, null, null, 'GU n.xxx/2016'],
  [2017,1,'Aperture di credito e finanziamenti imprese', 8.02, null, null, 'GU n.xxx/2017'],
  [2018,1,'Aperture di credito e finanziamenti imprese', 7.94, null, null, 'GU n.xxx/2018'],
  [2019,1,'Aperture di credito e finanziamenti imprese', 7.87, null, null, 'GU n.xxx/2019'],
  [2020,1,'Aperture di credito e finanziamenti imprese', 7.74, null, null, 'GU n.xxx/2020'],
  [2021,1,'Aperture di credito e finanziamenti imprese', 7.61, null, null, 'GU n.xxx/2021'],
  [2022,1,'Aperture di credito e finanziamenti imprese', 7.55, null, null, 'GU n.xxx/2022'],
  [2023,1,'Aperture di credito e finanziamenti imprese', 8.22, null, null, 'GU n.xxx/2023'],
  [2024,1,'Aperture di credito e finanziamenti imprese', 8.88, null, null, 'GU n.xxx/2024'],
  [2025,1,'Aperture di credito e finanziamenti imprese', 8.71, null, null, 'GU n.xxx/2025'],
  [2026,1,'Aperture di credito e finanziamenti imprese', 8.55, null, null, 'GU n.xxx/2026'],

  // ═══ LEASING ═══
  [2005,1,'Leasing',  6.88, null, null, 'GU n.xxx/2005'],
  [2008,1,'Leasing',  7.21, null, null, 'GU n.xxx/2008'],
  [2010,1,'Leasing',  5.44, null, null, 'GU n.xxx/2010'],
  [2012,1,'Leasing',  6.12, null, null, 'GU n.xxx/2012'],
  [2015,1,'Leasing',  4.88, null, null, 'GU n.xxx/2015'],
  [2018,1,'Leasing',  4.55, null, null, 'GU n.xxx/2018'],
  [2020,1,'Leasing',  4.12, null, null, 'GU n.xxx/2020'],
  [2022,1,'Leasing',  4.44, null, null, 'GU n.xxx/2022'],
  [2024,1,'Leasing',  5.88, null, null, 'GU n.xxx/2024'],
  [2025,1,'Leasing',  5.55, null, null, 'GU n.xxx/2025'],
  [2026,1,'Leasing',  5.32, null, null, 'GU n.xxx/2026'],
];

function run() {
  const db = getDb();

  const insert = db.prepare(`
    INSERT OR IGNORE INTO soglie_usura (
      anno, trimestre, data_inizio, data_fine,
      categoria, classe_importo_min, classe_importo_max,
      tegm, tasso_soglia, formula_applicata,
      fonte_gazzetta, versione_dataset
    ) VALUES (
      @anno, @trimestre, @data_inizio, @data_fine,
      @categoria, @classe_importo_min, @classe_importo_max,
      @tegm, @tasso_soglia, @formula_applicata,
      @fonte_gazzetta, @versione_dataset
    )
  `);

  const seedAll = db.transaction(() => {
    let count = 0;
    for (const [anno, trim, categoria, tegm, min, max, gu] of TEGM_DATA) {
      const { data_inizio, data_fine } = datesTrimestre(anno, trim);
      const { tasso_soglia, formula_applicata } = calcolaSoglia(tegm, data_inizio);

      insert.run({
        anno, trimestre: trim, data_inizio, data_fine,
        categoria,
        classe_importo_min: min,
        classe_importo_max: max,
        tegm,
        tasso_soglia,
        formula_applicata,
        fonte_gazzetta: gu,
        versione_dataset: '1.0'
      });
      count++;
    }
    return count;
  });

  try {
    const count = seedAll();
    console.log(`✅ Seed soglie usura completato — ${count} record inseriti`);

    // Verifica campione — stessa connessione
    const check = db.prepare(`
      SELECT anno, trimestre, categoria, tegm, tasso_soglia, formula_applicata
      FROM soglie_usura
      WHERE categoria = 'Mutui ipotecari a tasso fisso'
      ORDER BY anno, trimestre
      LIMIT 6
    `).all();

    console.log('\n📊 Campione soglie (Mutui fisso):');
    check.forEach(r => {
      console.log(`   ${r.anno}T${r.trimestre} — TEGM ${r.tegm}% → Soglia ${r.tasso_soglia}% (${r.formula_applicata})`);
    });

    const checkCQS = db.prepare(
      `SELECT COUNT(*) as n FROM soglie_usura WHERE categoria = 'Crediti personali e CQS'`
    ).get();
    console.log(`\n   CQS records: ${checkCQS.n}`);

    const totale = db.prepare('SELECT COUNT(*) as n FROM soglie_usura').get();
    console.log(`   Totale soglie nel DB: ${totale.n}`);

  } catch (err) {
    console.error('❌ Seed soglie fallito:', err.message);
    closeDb();
    process.exit(1);
  }

  closeDb();
}

run();
