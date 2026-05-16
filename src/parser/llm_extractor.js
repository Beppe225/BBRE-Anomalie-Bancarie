/**
 * llm_extractor.js — BBRE Sessione E
 * Invia testo o immagine a un LLM (Claude Anthropic o OpenAI) e ottiene
 * i dati strutturati del contratto in formato JSON validato.
 *
 * SICUREZZA: questo modulo gira SOLO nel main process Electron.
 * L'API key NON viene mai passata al renderer.
 *
 * Dipendenze: node-fetch (già presente in package.json)
 */

'use strict';

const fetch = require('node-fetch');

// ── PROMPT SISTEMA ────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `Sei un analista finanziario esperto in contratti bancari italiani.
Il tuo compito è estrarre dati strutturati da contratti di mutuo, prestiti o estratti conto.
Rispondi SOLO con un oggetto JSON valido, senza markdown, senza testo aggiuntivo, senza backtick.
Usa null per i campi non trovati nel documento.`;

const USER_PROMPT_TEMPLATE = (testo) => `Analizza questo documento bancario italiano ed estrai i dati richiesti.

DOCUMENTO:
---
${testo}
---

Restituisci ESCLUSIVAMENTE un JSON con questa struttura esatta:
{
  "tipo_contratto": "mutuo_ipotecario" | "cqs" | "credito_consumo" | null,
  "data_stipula": "YYYY-MM-DD" | null,
  "capitale": numero in euro (es. 150000) | null,
  "tan": numero percentuale (es. 4.5) | null,
  "durata_mesi": numero intero (es. 240) | null,
  "taeg": numero percentuale | null,
  "voci_costo": [
    { "voce": "nome voce", "importo": numero in euro }
  ],
  "intestatario": "nome e cognome" | null,
  "banca": "nome istituto" | null,
  "note_parser": "eventuali anomalie o dati incerti"
}

REGOLE:
- tipo_contratto: se trovi "mutuo" o "ipotecario" usa "mutuo_ipotecario"; se "cessione quinto" usa "cqs"; altrimenti "credito_consumo"
- data_stipula: converti sempre in formato ISO YYYY-MM-DD
- capitale: solo il numero, senza simboli euro
- tan: solo il numero percentuale, senza il simbolo %
- durata_mesi: converti anni in mesi se necessario (es. 20 anni = 240 mesi)
- voci_costo: includi spese istruttoria, perizia, assicurazione, bollo, commissioni, polizze
- se un dato è assente o illeggibile, usa null
- voci_costo può essere array vuoto [] se nessuna voce trovata`;

// ── CHIAMATA CLAUDE ANTHROPIC ────────────────────────────────────────────────
async function chiamaClaudeAnthropic(documento, apiKey) {
  const { testo_estratto, base64_immagine, mime_type } = documento;

  let content;

  if (base64_immagine && mime_type && mime_type.startsWith('image/')) {
    // Vision: immagine
    content = [
      {
        type: 'image',
        source: { type: 'base64', media_type: mime_type, data: base64_immagine }
      },
      {
        type: 'text',
        text: USER_PROMPT_TEMPLATE('[Testo presente nell\'immagine allegata. Analizza l\'immagine del documento.]')
      }
    ];
  } else if (testo_estratto) {
    // Testo estratto da PDF
    content = USER_PROMPT_TEMPLATE(testo_estratto);
  } else if (base64_immagine) {
    // PDF come base64 — Claude supporta PDF nativi
    content = [
      {
        type: 'document',
        source: { type: 'base64', media_type: 'application/pdf', data: base64_immagine }
      },
      {
        type: 'text',
        text: USER_PROMPT_TEMPLATE('[Documento PDF allegato. Analizza il contenuto.]')
      }
    ];
  } else {
    throw new Error('Nessun contenuto da inviare all\'LLM');
  }

  const body = {
    model: 'claude-opus-4-5',
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content }]
  };

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify(body),
    timeout: 60000
  });

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`Anthropic API error ${response.status}: ${errBody.substring(0, 200)}`);
  }

  const data = await response.json();
  const rawText = data.content && data.content[0] && data.content[0].text;
  if (!rawText) throw new Error('Risposta Claude vuota');
  return rawText;
}

// ── CHIAMATA OPENAI ──────────────────────────────────────────────────────────
async function chiamaOpenAI(documento, apiKey) {
  const { testo_estratto, base64_immagine, mime_type } = documento;

  let messages;

  if (base64_immagine && mime_type && mime_type.startsWith('image/')) {
    messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: { url: `data:${mime_type};base64,${base64_immagine}` }
          },
          {
            type: 'text',
            text: USER_PROMPT_TEMPLATE('[Analizza l\'immagine del documento allegato.]')
          }
        ]
      }
    ];
  } else {
    const testo = testo_estratto || '[Documento non leggibile come testo]';
    messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: USER_PROMPT_TEMPLATE(testo) }
    ];
  }

  const body = {
    model: 'gpt-4o',
    max_tokens: 1024,
    messages,
    response_format: { type: 'json_object' }
  };

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify(body),
    timeout: 60000
  });

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`OpenAI API error ${response.status}: ${errBody.substring(0, 200)}`);
  }

  const data = await response.json();
  const rawText = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
  if (!rawText) throw new Error('Risposta OpenAI vuota');
  return rawText;
}

// ── PARSING E VALIDAZIONE JSON ───────────────────────────────────────────────
function parsaRispostaLLM(rawText) {
  // Rimuovi eventuali backtick/markdown rimasti
  let cleaned = rawText
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g, '')
    .trim();

  // Prendi solo la parte JSON se c'è testo prima/dopo
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (jsonMatch) cleaned = jsonMatch[0];

  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    throw new Error(`JSON non valido nella risposta LLM: ${err.message}\nRisposta: ${cleaned.substring(0, 300)}`);
  }

  // Validazione e normalizzazione dei tipi
  return normalizzaDati(parsed);
}

function normalizzaDati(raw) {
  const tipiValidi = ['mutuo_ipotecario', 'cqs', 'credito_consumo'];

  return {
    tipo_contratto: tipiValidi.includes(raw.tipo_contratto) ? raw.tipo_contratto : null,
    data_stipula:   validaData(raw.data_stipula),
    capitale:       validaNumero(raw.capitale),
    tan:            validaNumero(raw.tan),
    durata_mesi:    validaIntero(raw.durata_mesi),
    taeg:           validaNumero(raw.taeg),
    voci_costo:     Array.isArray(raw.voci_costo)
                      ? raw.voci_costo.filter(v => v && v.voce && validaNumero(v.importo) !== null)
                                      .map(v => ({ voce: String(v.voce), importo: parseFloat(v.importo) }))
                      : [],
    intestatario:   raw.intestatario || null,
    banca:          raw.banca || null,
    note_parser:    raw.note_parser || null
  };
}

function validaData(val) {
  if (!val) return null;
  const s = String(val).trim();
  // Accetta YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // Prova parsing generico
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
  return null;
}

function validaNumero(val) {
  if (val === null || val === undefined || val === '') return null;
  const n = parseFloat(val);
  return isNaN(n) ? null : n;
}

function validaIntero(val) {
  if (val === null || val === undefined || val === '') return null;
  const n = parseInt(val, 10);
  return isNaN(n) ? null : n;
}

// ── ENTRY POINT PRINCIPALE ───────────────────────────────────────────────────
/**
 * Estrae dati strutturati da un documento usando un LLM.
 *
 * @param {object} documento  Output di document_loader.caricaDocumento()
 * @param {object} config     { provider: 'claude'|'openai', api_key: string }
 * @returns {Promise<{
 *   successo: boolean,
 *   dati: object|null,
 *   provider_usato: string,
 *   errore: string|null
 * }>}
 */
async function estraiDatiLLM(documento, config) {
  const { provider = 'claude', api_key } = config || {};

  if (!api_key || api_key.trim() === '') {
    return {
      successo: false,
      dati: null,
      provider_usato: provider,
      errore: 'API key non configurata. Vai in Impostazioni → Parser LLM e inserisci la tua API key.'
    };
  }

  if (documento.errore && !documento.testo_estratto && !documento.base64_immagine) {
    return {
      successo: false,
      dati: null,
      provider_usato: provider,
      errore: `Documento non caricabile: ${documento.errore}`
    };
  }

  try {
    console.log(`🤖 Chiamata LLM (${provider}) per documento: ${documento.nome_file}`);

    let rawText;
    if (provider === 'openai') {
      rawText = await chiamaOpenAI(documento, api_key.trim());
    } else {
      rawText = await chiamaClaudeAnthropic(documento, api_key.trim());
    }

    const dati = parsaRispostaLLM(rawText);
    console.log('✅ Dati estratti:', JSON.stringify(dati, null, 2));

    return { successo: true, dati, provider_usato: provider, errore: null };
  } catch (err) {
    console.error('❌ Errore LLM extractor:', err.message);
    return {
      successo: false,
      dati: null,
      provider_usato: provider,
      errore: err.message
    };
  }
}

module.exports = { estraiDatiLLM };
