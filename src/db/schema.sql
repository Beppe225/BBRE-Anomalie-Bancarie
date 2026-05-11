-- Schema BBRE - Database Anomalie Bancarie
-- Usando sql.js (SQLite in-memory con persistenza su file)

-- Tabella soglie_usura (dati ufficiali Banca d'Italia)
CREATE TABLE IF NOT EXISTS soglie_usura (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    anno INTEGER NOT NULL,
    trimestre INTEGER NOT NULL CHECK(trimestre BETWEEN 1 AND 4),
    tipo_contratto TEXT NOT NULL CHECK(tipo_contratto IN (
        'mutuo_ipotecario',
        'cqs',
        'credito_consumo',
        'leasing',
        'finanziamento_aziendale'
    )),
    tegm REAL NOT NULL,
    tasso_soglia REAL NOT NULL,
    data_pubblicazione DATE,
    hash_dataset TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(anno, trimestre, tipo_contratto)
);

-- Tabella regole_normative (motore regole da DB)
CREATE TABLE IF NOT EXISTS regole_normative (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    codice_regola TEXT UNIQUE NOT NULL,
    descrizione TEXT NOT NULL,
    tipo_regola TEXT CHECK(tipo_regola IN ('inclusione', 'esclusione', 'calcolo', 'soglia')),
    parametri JSON,
    attiva BOOLEAN DEFAULT 1,
    valid_from DATE,
    valid_to DATE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Tabella audit_analisi (tracciabilità completa)
CREATE TABLE IF NOT EXISTS audit_analisi (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    analisi_id TEXT UNIQUE NOT NULL,
    hash_catena TEXT NOT NULL,
    versione_engine TEXT NOT NULL,
    dataset_soglie TEXT,
    timestamp_analisi DATETIME DEFAULT CURRENT_TIMESTAMP,
    regole_applicate JSON,
    input_hash TEXT,
    engine_hash TEXT,
    output_hash TEXT
);

-- Tabella config_app (configurazione applicazione)
CREATE TABLE IF NOT EXISTS config_app (
    chiave TEXT PRIMARY KEY,
    valore TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Tabella contratti (inserimento pratiche)
CREATE TABLE IF NOT EXISTS contratti (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    contratto_id TEXT UNIQUE NOT NULL,
    tipo_contratto TEXT NOT NULL,
    data_stipula DATE NOT NULL,
    capitale REAL NOT NULL,
    tan_dichiarato REAL,
    taeg_dichiarato REAL,
    istituto_finanziario TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Tabella voci_costo (dettaglio costi contratto)
CREATE TABLE IF NOT EXISTS voci_costo (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    contratto_id TEXT NOT NULL,
    voce TEXT NOT NULL,
    importo REAL NOT NULL,
    tipologia TEXT CHECK(tipologia IN ('interesse', 'spesa', 'polizza', 'altro')),
    inclusa_teg BOOLEAN DEFAULT 1,
    FOREIGN KEY (contratto_id) REFERENCES contratti(contratto_id),
    UNIQUE(contratto_id, voce)
);

-- Indici strategici per performance
CREATE INDEX IF NOT EXISTS idx_soglie_anno_trimestre ON soglie_usura(anno, trimestre);
CREATE INDEX IF NOT EXISTS idx_soglie_tipo ON soglie_usura(tipo_contratto);
CREATE INDEX IF NOT EXISTS idx_audit_analisi_id ON audit_analisi(analisi_id);
CREATE INDEX IF NOT EXISTS idx_contratti_data ON contratti(data_stipula);
CREATE INDEX IF NOT EXISTS idx_voci_contratto ON voci_costo(contratto_id);

-- Seed iniziale config
INSERT OR IGNORE INTO config_app (chiave, valore) VALUES 
    ('versione_engine', '1.0.0'),
    ('ultimo_update_soglie', ''),
    ('enable_realtime_market', 'false'),
    ('db_schema_version', '1.0');
