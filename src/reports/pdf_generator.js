const { BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

/**
 * Genera il PDF e lo restituisce come Buffer (in memoria)
 * NON scrive ancora su disco
 */
async function genera_pdf_buffer(datiAnalisi) {
  try {
    console.log('📄 Generazione PDF in memoria...');

    const templatePath = path.join(__dirname, 'templates', 'report_template.html');
    
    if (!fs.existsSync(templatePath)) {
      throw new Error(`Template non trovato: ${templatePath}`);
    }

    // Finestra nascosta per generare il PDF
    const win = new BrowserWindow({
      show: false,
      webPreferences: {
        contextIsolation: false, 
        nodeIntegration: true 
      }
    });

    await win.loadFile(templatePath);

    // Inietta i dati
    await win.webContents.executeJavaScript(`
      window.renderReport(${JSON.stringify(datiAnalisi)});
    `);

    // Genera il PDF buffer
    const pdfBuffer = await win.webContents.printToPDF({
      marginsType: 0,
      pageSize: 'A4',
      printBackground: false
    });

    win.close();

    // Crea un nome file sicuro
    const safeId = (datiAnalisi.contratto_id || 'Report').replace(/[^a-zA-Z0-9]/g, '_');
    const fileName = `BBRE_${safeId}_${Date.now()}.pdf`;

    return { buffer: pdfBuffer, fileName: fileName };

  } catch (err) {
    console.error('❌ Errore generazione PDF:', err);
    throw err;
  }
}

module.exports = { genera_pdf_buffer };
