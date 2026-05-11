-- Schema Database BBRE - Anomalie Bancarie
-- FASE 1: Tabelle per soglie usura, regole normative e audit

-- Tabella soglie_usura (dati Banca d'Italia)
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
    tegm REAL NOT NULL,  -- TEGM Banca d'Italia
    tasso_soglia REAL NOT NULL,  -- Tasso soglia calcolato
    delta_soglia REAL,  -- Delta applicato (pre/post 2011)
    formula_calcolo TEXT,  -- "TEGM*1.5" o "TEGM+25%+4pp"
    data_pubblicazione DATE,
    hash_dataset TEXT,  -- SHA256 del file sorgente
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(anno, trimestre, tipo_contratto)
);

CREATE INDEX idx_soglie_lookup ON soglie_usura(anno, trimestre, tipo_contratto);
CREATE INDEX idx_soglie_data ON soglie_usura(data_pubblicazione);

-- Tabella regole_normative (motore regole)
CREATE TABLE IF NOT EXISTS regole_normative (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    codice_regola TEXT UNIQUE NOT NULL,  -- es: R001, R002...
    descrizione TEXT NOT NULL,
    tipo_regola TEXT NOT NULL CHECK(tipo_regola IN (
        'inclusione',
        'esclusione',
        'soglia',
        'calcolo',
        'documentazione'
    )),
    parametri JSON,  -- Parametri configurazione
    attiva INTEGER DEFAULT 1 CHECK(attiva IN (0, 1)),
    valid_from DATE,
    valid_to DATE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_regole_attive ON regole_normative(attiva, valid_from, valid_to);

-- Tabella audit_analisi (tracciabilità completa)
CREATE TABLE IF NOT EXISTS audit_analisi (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    analisi_id TEXT UNIQUE NOT NULL,  -- ID univoco pratica
    contratto_id TEXT,  -- Riferimento contratto
    hash_catena TEXT NOT NULL,  -- SHA256(input+engine+regole+soglie)
    hash_report TEXT,  -- SHA256 del PDF generato
    versione_engine TEXT NOT NULL,
    dataset_soglie TEXT,  -- Versione dataset usato
    timestamp_analisi DATETIME DEFAULT CURRENT_TIMESTAMP,
    output_hash TEXT,  -- Hash del risultato
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_audit_pratica ON audit_analisi(analisi_id);
CREATE INDEX idx_audit_data ON audit_analisi(timestamp_analisi);

-- Tabella config_app (configurazione applicazione)
CREATE TABLE IF NOT EXISTS config_app (
    chiave TEXT PRIMARY KEY,
    valore TEXT,
    descrizione TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Inserimento configurazione iniziale
INSERT OR REPLACE INTO config_app (chiave, valore, descrizione) VALUES
    ('versione_engine', '1.0.0', 'Versione motore di calcolo'),
    ('ultimo_update_soglie', NULL, 'Data ultimo aggiornamento soglie'),
    ('enable_realtime_market', 'false', 'Abilita dati mercato real-time'),
    ('db_schema_version', '1.0', 'Versione schema database'),
    ('ultimo_hash_soglie', NULL, 'Hash ultimo dataset soglie');
