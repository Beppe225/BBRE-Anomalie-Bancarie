# BBRE Anomalie Bancarie — Roadmap & Implementazioni Future

Ultimo aggiornamento: 17 Maggio 2026
Versione corrente: **v1.2.0**

---

## ✅ Completate

| Sessione | Descrizione | Versione |
|---|---|---|
| A-D | Core engine: IRR/TEG, score 0-4, soglie BdI 2005-2026, report PDF base | v1.0.0 |
| E | Parser LLM: carica PDF/immagine → pre-compila form | v1.0.1 |
| F | Anatocismo: piano francese, delta interessi, score 0-3 | v1.0.1 |
| G | Export Excel 4 sheet (Riepilogo, Voci, Fattori, Moratori) | v1.1.0 |
| H | Moratori: soglia moratoria, score 0-3, fattori M1-M6 | v1.1.0 |
| I | Report PDF potenziato: sezioni moratori + anatocismo condizionali | v1.1.0 |
| J | Validazione input: errori bloccanti, warning, info pre-analisi | v1.2.0 |
| K | Dashboard statistiche: KPI, score chart, trend mensile | v1.2.0 |
| NPL | Modulo NPL/Stralcio: ROI, haircut, score 0-5, fattori N1-N8 | v1.2.0 |
| Build | electron-builder.yml, BUILD_PUBLISH.bat, BUILD.md | v1.2.0 |

---

## 🔜 Prossima sessione — v1.3.0

### 1. Campo Durata visibile in Step 1
- **Priorità:** Alta
- **Impatto:** Il default 84 mesi causa errori su mutui 20-30 anni
- **Dettaglio:**
  - Campo input numerico "Durata (mesi)" in Step 1, default 84, range 6-480
  - Mostrare rata mensile stimata in tempo reale sotto il campo TAN
  - Includere nel payload, nel reset form e nell'export Excel
- **File da modificare:** `index.html`, `app.js`

### 2. Campo Cliente / Riferimento Pratica
- **Priorità:** Alta  
- **Impatto:** L'archivio è inutilizzabile senza nomi — ID numerico non basta
- **Dettaglio:**
  - Campo testo opzionale "Cliente / Riferimento" in Step 1
  - Colonna `ref_cliente TEXT` in `audit_analisi` (migrazione non-destructive)
  - Visibile in archivio (colonna), report PDF (intestazione), Excel sheet 1
- **File da modificare:** `orchestrator.js`, `ipc_handlers.js`, `app.js`, `report_template.html`

### 3. Ricerca e Filtro Archivio
- **Priorità:** Alta (cresce con l'uso)
- **Impatto:** Con 50+ pratiche l'archivio diventa ingestibile senza filtri
- **Dettaglio:**
  - Barra ricerca testo libero (ref_cliente, ID) — filtro real-time lato renderer
  - Dropdown: tipo contratto, score minimo, usura sì/no
  - Pulsante reset filtri
  - Contatore "X pratiche su Y"
- **File da modificare:** `app.js`

### 4. Report PDF — Spiegazione in linguaggio semplice
- **Priorità:** Alta
- **Impatto:** Il report attuale è tecnico — non comprensibile dal cliente finale
- **Dettaglio:**
  - Sezione narrativa "Cosa significa questo risultato?" generata dinamicamente
  - Testo calibrato su score (0-4), delta pp, polizza, moratori, anatocismo
  - Paragrafo "Perché il tuo mutuo costa più del TAN dichiarato"
  - Paragrafo "Cosa fare adesso" specifico per ogni livello di score
  - Linguaggio accessibile, ottimizzato B/N, max 1 pagina aggiuntiva
- **File da modificare:** `report_template.html`

---

## 📋 Backlog — v1.4.0 e oltre

### Soglie usura automatiche (scraping BdI)
- **Priorità:** Media
- **Descrizione:** Aggiornamento automatico soglie via scraping decreti trimestrali Banca d'Italia
- **Nota:** Attualmente database arriva a 2026 T2 — aggiornamento manuale ogni trimestre

### Calcolo rata in tempo reale
- **Priorità:** Media
- **Descrizione:** Mostrare rata mensile stimata durante inserimento dati Step 1
- **Formula:** rata = C * (r/12) / (1 - (1+r/12)^-n)
- **Già inclusa in v1.3.0** come parte del campo durata

### Report PDF NPL/Stralcio
- **Priorità:** Media
- **Descrizione:** Report PDF professionale per analisi NPL — da consegnare a investitori/family office
- **Contenuto:** score, ROI, fattori N1-N8, disclaimer, hash SHA-256

### Confronto pratiche side by side
- **Priorità:** Bassa
- **Descrizione:** Affiancare due contratti per confrontare TAEG e score
- **Use case:** Cliente con rifinanziamento — confronta vecchio vs nuovo mutuo

### Multi-lingua (EN)
- **Priorità:** Bassa
- **Descrizione:** Versione inglese per clienti stranieri o family office internazionali
- **Nota:** Richiede refactor stringhe in file i18n separato

### Tema chiaro (light mode)
- **Priorità:** Bassa
- **Descrizione:** Sfondo bianco per chi preferisce o per stampa diretta da schermo
- **Nota:** Aggiungere toggle in Impostazioni

### Invio email report
- **Priorità:** Bassa
- **Descrizione:** Inviare il report PDF direttamente via email al cliente
- **Nota:** Richiede configurazione SMTP in Impostazioni

### Modulo #06 NPL Protocol
- **Priorità:** Media (allineamento con BBRE Protocols)
- **Descrizione:** Integrare il workflow del Protocol #06 NPL nel modulo esistente
- **Nota:** Aggiungere checklist due diligence, timeline recupero, documenti richiesti

---

## 🐛 Bug noti / Fix pendenti

| Bug | Severità | Stato |
|---|---|---|
| Durata default 84 mesi hardcoded — non visibile all'utente | Alta | Fix in v1.3.0 |
| Archivio senza ricerca difficile da usare con molte pratiche | Media | Fix in v1.3.0 |
| Nessun riferimento cliente nelle pratiche | Media | Fix in v1.3.0 |
| Soglie 2026 T3/T4 non ancora disponibili | Bassa | Aggiornamento Q3 2026 |

---

## 📊 Metriche attuali (v1.2.0)

- **Canali IPC:** 18
- **Engine modules:** 6 (score, regole, anatocismo, moratori, npl, validation)
- **Righe report_template.html:** 386
- **Righe app.js:** ~1100
- **Soglie usura in DB:** 2005-2026 T2 (tutti i trimestri, 3 tipologie)
- **Target build:** Windows x64 (NSIS installer + Portable)
