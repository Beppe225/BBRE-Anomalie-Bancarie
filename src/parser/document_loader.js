/**
 * document_loader.js — BBRE Sessione E
 * Carica un PDF o un'immagine e restituisce testo estratto o base64.
 * Dipendenze: pdf-parse (installata), fs nativo Node.
 * NON usa Express. Solo Node puro. Chiamato dal main process Electron.
 */

'use strict';

const fs   = require('fs');
const path = require('path');

// pdf-parse v2: usa classe PDFParse (v1 usava funzione diretta)
let pdfParse = null;
try {
  const pp = require('pdf-parse');
  if (typeof pp === 'function') {
    // v1 — funzione diretta (buffer) → {text, numpages}
    pdfParse = pp;
  } else if (pp && typeof pp.PDFParse === 'function') {
    // v2 — new PDFParse({data: Uint8Array}) → .getText({}) → {text, total}
    const PDFParseV2 = pp.PDFParse;
    pdfParse = async (buffer) => {
      const parser = new PDFParseV2({ verbosity: 0, data: new Uint8Array(buffer) });
      await parser.load();
      const result = await parser.getText({});
      return { text: result.text || '', numpages: result.total || 1 };
    };
  }
} catch (_) {
  pdfParse = null;
}

/**
 * Rileva il tipo di file dal percorso.
 * @param {string} filePath
 * @returns {'pdf'|'immagine'|'sconosciuto'}
 */
function rilevaTipoFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.pdf') return 'pdf';
  if (['.jpg', '.jpeg', '.png', '.webp', '.bmp', '.tiff', '.tif'].includes(ext)) return 'immagine';
  return 'sconosciuto';
}

/**
 * Carica e analizza un documento.
 *
 * @param {string} filePath  Percorso assoluto al file
 * @returns {Promise<{
 *   tipo_file: 'pdf'|'immagine'|'sconosciuto',
 *   testo_estratto: string|null,
 *   base64_immagine: string|null,
 *   mime_type: string|null,
 *   pagine: number,
 *   nome_file: string,
 *   errore: string|null
 * }>}
 */
async function caricaDocumento(filePath) {
  const tipo_file = rilevaTipoFile(filePath);
  const nome_file = path.basename(filePath);

  const base = {
    tipo_file,
    testo_estratto: null,
    base64_immagine: null,
    mime_type: null,
    pagine: 0,
    nome_file,
    errore: null
  };

  if (!fs.existsSync(filePath)) {
    return { ...base, errore: `File non trovato: ${filePath}` };
  }

  const buffer = fs.readFileSync(filePath);

  // ── PDF ──────────────────────────────────────────────────────────────────
  if (tipo_file === 'pdf') {
    if (!pdfParse) {
      // Fallback: restituisce il PDF come base64 perché l'LLM con vision può leggerlo
      console.warn('⚠️  pdf-parse non disponibile, fallback base64');
      return {
        ...base,
        base64_immagine: buffer.toString('base64'),
        mime_type: 'application/pdf',
        pagine: 1,
        errore: null
      };
    }

    try {
      const data = await pdfParse(buffer, {
        // Limita a 50 pagine per evitare contratti lunghissimi
        max: 50
      });

      let testo = data.text || '';
      // Normalizza spazi multipli e righe vuote eccessive
      testo = testo
        .replace(/[ \t]{3,}/g, '  ')
        .replace(/\n{4,}/g, '\n\n')
        .trim();

      // Tronca a 8000 caratteri: sufficiente per un mutuo standard
      if (testo.length > 8000) {
        testo = testo.substring(0, 8000) + '\n\n[... documento troncato per elaborazione ...]';
      }

      return {
        ...base,
        testo_estratto: testo,
        pagine: data.numpages || 1,
        errore: null
      };
    } catch (err) {
      console.error('❌ Errore estrazione PDF:', err.message);
      // Fallback base64 se l'estrazione testo fallisce
      return {
        ...base,
        base64_immagine: buffer.toString('base64'),
        mime_type: 'application/pdf',
        pagine: 1,
        errore: `Estrazione testo fallita, inviato come immagine: ${err.message}`
      };
    }
  }

  // ── IMMAGINE ─────────────────────────────────────────────────────────────
  if (tipo_file === 'immagine') {
    const ext = path.extname(filePath).toLowerCase();
    const mimeMap = {
      '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.webp': 'image/webp',
      '.bmp': 'image/bmp',
      '.tiff': 'image/tiff', '.tif': 'image/tiff'
    };
    const mime_type = mimeMap[ext] || 'image/jpeg';

    // Verifica dimensione: max 5MB per le API vision
    const maxBytes = 5 * 1024 * 1024;
    if (buffer.length > maxBytes) {
      return {
        ...base,
        errore: `Immagine troppo grande (${(buffer.length / 1024 / 1024).toFixed(1)} MB). Massimo 5 MB.`
      };
    }

    return {
      ...base,
      base64_immagine: buffer.toString('base64'),
      mime_type,
      pagine: 1,
      errore: null
    };
  }

  // ── TIPO NON SUPPORTATO ──────────────────────────────────────────────────
  return {
    ...base,
    errore: `Tipo file non supportato: ${path.extname(filePath)}. Usa PDF, JPG o PNG.`
  };
}

module.exports = { caricaDocumento, rilevaTipoFile };
