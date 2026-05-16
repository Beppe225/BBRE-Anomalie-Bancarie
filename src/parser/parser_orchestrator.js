/**
 * parser_orchestrator.js — BBRE Sessione E
 * Coordina document_loader → llm_extractor e restituisce i dati
 * pronti per pre-compilare Step 1 del form.
 *
 * Chiamato esclusivamente dal main process Electron via ipc_handlers.js.
 */

'use strict';

const { caricaDocumento } = require('./document_loader');
const { estraiDatiLLM }   = require('./llm_extractor');

/**
 * Pipeline completa: file → testo/base64 → LLM → dati strutturati.
 *
 * @param {string} filePath     Percorso assoluto al file
 * @param {object} configLLM    { provider: 'claude'|'openai', api_key: string }
 * @returns {Promise<{
 *   successo: boolean,
 *   dati_form: {
 *     tipo_contratto: string|null,
 *     data_stipula: string|null,
 *     capitale: number|null,
 *     tan: number|null,
 *     durata_mesi: number|null,
 *     voci_costo: Array<{voce:string, importo:number}>,
 *     intestatario: string|null,
 *     banca: string|null,
 *     note_parser: string|null
 *   }|null,
 *   meta: {
 *     nome_file: string,
 *     tipo_file: string,
 *     pagine: number,
 *     provider_usato: string,
 *     errore_caricamento: string|null,
 *     errore_llm: string|null
 *   }
 * }>}
 */
async function analizzaDocumento(filePath, configLLM) {
  console.log(`📄 Parser: inizio analisi di "${filePath}"`);

  // ── STEP 1: Carica documento ─────────────────────────────────────────────
  let documento;
  try {
    documento = await caricaDocumento(filePath);
  } catch (err) {
    return {
      successo: false,
      dati_form: null,
      meta: {
        nome_file: filePath,
        tipo_file: 'sconosciuto',
        pagine: 0,
        provider_usato: configLLM?.provider || 'claude',
        errore_caricamento: `Errore lettura file: ${err.message}`,
        errore_llm: null
      }
    };
  }

  // Tipo file non supportato
  if (documento.tipo_file === 'sconosciuto') {
    return {
      successo: false,
      dati_form: null,
      meta: {
        nome_file: documento.nome_file,
        tipo_file: documento.tipo_file,
        pagine: 0,
        provider_usato: configLLM?.provider || 'claude',
        errore_caricamento: documento.errore || 'Tipo file non supportato',
        errore_llm: null
      }
    };
  }

  console.log(`✅ Documento caricato: ${documento.nome_file} (${documento.tipo_file}, ${documento.pagine} pag.)`);
  if (documento.testo_estratto) {
    console.log(`   Testo estratto: ${documento.testo_estratto.length} caratteri`);
  }

  // ── STEP 2: Chiama LLM ───────────────────────────────────────────────────
  const risultatoLLM = await estraiDatiLLM(documento, configLLM);

  // ── STEP 3: Assembla risposta ────────────────────────────────────────────
  const meta = {
    nome_file:           documento.nome_file,
    tipo_file:           documento.tipo_file,
    pagine:              documento.pagine,
    provider_usato:      risultatoLLM.provider_usato,
    errore_caricamento:  documento.errore || null,
    errore_llm:          risultatoLLM.errore || null
  };

  if (!risultatoLLM.successo) {
    return { successo: false, dati_form: null, meta };
  }

  return {
    successo: true,
    dati_form: risultatoLLM.dati,
    meta
  };
}

/**
 * Legge la config LLM dal DB (api_key e provider).
 * Deve essere chiamato dal main process con l'istanza del DB.
 *
 * @param {object} db  Istanza sql.js
 * @returns {{ provider: string, api_key: string }}
 */
function leggiConfigLLM(db) {
  try {
    const res = db.exec("SELECT chiave, valore FROM config_app WHERE chiave IN ('llm_provider','llm_api_key')");
    const config = { provider: 'claude', api_key: '' };
    if (res.length > 0) {
      res[0].values.forEach(([k, v]) => {
        if (k === 'llm_provider') config.provider = v || 'claude';
        if (k === 'llm_api_key')  config.api_key  = v || '';
      });
    }
    return config;
  } catch (_) {
    return { provider: 'claude', api_key: '' };
  }
}

module.exports = { analizzaDocumento, leggiConfigLLM };
