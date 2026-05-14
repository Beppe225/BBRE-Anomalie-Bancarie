-- BBRE Anomalie Bancarie — Schema DB v1.0
-- SQLite WAL mode — tutte le FK abilitate a runtime

PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

-- ─────────────────────────────────────────────────────────────────
-- 1. CONTRATTI
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS contratti (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  tipo                TEXT NOT NULL CHECK (tipo IN (
                        'mutuo_fondiario','CQS','credito_consumo',
                        'leasing','finanziamento_aziendale')),
  data_stipula        TEXT NOT NULL,  -- ISO 8601: YYYY-MM-DD
  capitale_erogato    REAL NOT NULL CHECK (capitale_erogato > 0),
  tan_dichiarato      REAL,           -- % annuo
  teg_dichiarato      REAL,           -- % annuo
  durata_mesi         INTEGER NOT NULL CHECK (durata_mesi > 0),
  rata_mensile        REAL,
  ammortamento        TEXT CHECK (ammortamento IN ('francese','italiano','bullet')),
  note                TEXT,
  created_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_contratti_tipo        ON contratti(tipo);
CREATE INDEX IF NOT EXISTS idx_contratti_data        ON contratti(data_stipula);

-- ─────────────────────────────────────────────────────────────────
-- 2. VOCI DI COSTO
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS voci_costo (
  id                        INTEGER PRIMARY KEY AUTOINCREMENT,
  contratto_id              INTEGER NOT NULL REFERENCES contratti(id) ON DELETE CASCADE,
  tipo_voce                 TEXT NOT NULL CHECK (tipo_voce IN (
                              'commissione','spesa','polizza','altro')),
  descrizione               TEXT NOT NULL,
  importo_totale            REAL NOT NULL CHECK (importo_totale >= 0),
  importo_annuo             REAL,
  condizionante             INTEGER NOT NULL DEFAULT 0 CHECK (condizionante IN (0,1)),
  inclusa_teg_dichiarato    INTEGER NOT NULL DEFAULT 0 CHECK (inclusa_teg_dichiarato IN (0,1)),
  note                      TEXT
);

CREATE INDEX IF NOT EXISTS idx_voci_contratto ON voci_costo(contratto_id);

-- ─────────────────────────────────────────────────────────────────
-- 3. SOGLIE USURA (dati Banca d'Italia)
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS soglie_usura (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  anno                INTEGER NOT NULL,
  trimestre           INTEGER NOT NULL CHECK (trimestre IN (1,2,3,4)),
  data_inizio         TEXT NOT NULL,  -- ISO 8601
  data_fine           TEXT NOT NULL,
  categoria           TEXT NOT NULL,
  classe_importo_min  REAL,           -- NULL = nessun minimo
  classe_importo_max  REAL,           -- NULL = nessun massimo
  tegm                REAL NOT NULL,  -- Tasso Effettivo Globale Medio %
  tasso_soglia        REAL NOT NULL,  -- soglia usura %
  formula_applicata   TEXT NOT NULL CHECK (formula_applicata IN ('vecchia','nuova')),
  -- vecchia: ante 2011 → TEGM × 1.5
  -- nuova:   post 2011 → TEGM + (TEGM × 25%) + 4pp, max delta 8pp
  fonte_gazzetta      TEXT,
  data_importazione   TEXT NOT NULL DEFAULT (datetime('now')),
  versione_dataset    TEXT NOT NULL DEFAULT '1.0',
  note                TEXT,
  UNIQUE(anno, trimestre, categoria, classe_importo_min, classe_importo_max)
);

CREATE INDEX IF NOT EXISTS idx_soglie_periodo   ON soglie_usura(anno, trimestre);
CREATE INDEX IF NOT EXISTS idx_soglie_categoria ON soglie_usura(categoria);
CREATE INDEX IF NOT EXISTS idx_soglie_date      ON soglie_usura(data_inizio, data_fine);

-- ─────────────────────────────────────────────────────────────────
-- 4. REGOLE NORMATIVE (logica giuridica separata dal codice)
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS regole_normative (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  codice                TEXT NOT NULL UNIQUE,
  titolo                TEXT NOT NULL,
  tipo                  TEXT NOT NULL CHECK (tipo IN (
                          'soglia','polizza','moratori','anatocismo','scoring')),
  contenuto_testo       TEXT NOT NULL,
  riferimento_normativo TEXT,
  data_inizio_validita  TEXT,
  data_fine_validita    TEXT,
  attiva                INTEGER NOT NULL DEFAULT 1 CHECK (attiva IN (0,1)),
  versione              TEXT NOT NULL DEFAULT '1.0',
  note_redazionali      TEXT
);

CREATE INDEX IF NOT EXISTS idx_regole_tipo   ON regole_normative(tipo);
CREATE INDEX IF NOT EXISTS idx_regole_attiva ON regole_normative(attiva);

-- ─────────────────────────────────────────────────────────────────
-- 5. ANALISI
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS analisi (
  id                            INTEGER PRIMARY KEY AUTOINCREMENT,
  contratto_id                  INTEGER NOT NULL REFERENCES contratti(id) ON DELETE RESTRICT,
  teg_reale_calcolato           REAL,
  teg_dichiarato_ricalcolato    REAL,
  delta_vs_soglia               REAL,   -- teg_reale - tasso_soglia (negativo = ok)
  soglia_usura_id               INTEGER REFERENCES soglie_usura(id),
  score                         INTEGER CHECK (score BETWEEN 0 AND 4),
  -- 0=verde/ok, 1=giallo/attenzione, 2=arancio/anomalia, 3=rosso/usura probabile, 4=rosso scuro/usura
  score_fattori                 TEXT,   -- JSON: array di {fattore, peso, valore, contributo}
  affidabilita_analisi          TEXT CHECK (affidabilita_analisi IN ('alta','media','bassa')),
  polizza_condizionante_presente INTEGER DEFAULT 0 CHECK (polizza_condizionante_presente IN (0,1)),
  moratori_in_anomalia          INTEGER DEFAULT 0 CHECK (moratori_in_anomalia IN (0,1)),
  interessi_stimati_totali      REAL,
  recupero_stimato_min          REAL,
  recupero_stimato_max          REAL,
  warnings                      TEXT,  -- JSON: array di stringhe
  note_analisi                  TEXT,
  created_at                    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_analisi_contratto ON analisi(contratto_id);
CREATE INDEX IF NOT EXISTS idx_analisi_score     ON analisi(score);
CREATE INDEX IF NOT EXISTS idx_analisi_created   ON analisi(created_at);

-- ─────────────────────────────────────────────────────────────────
-- 6. AUDIT ANALISI (tracciabilità completa)
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_analisi (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  analisi_id            INTEGER NOT NULL REFERENCES analisi(id) ON DELETE CASCADE,
  versione_engine       TEXT NOT NULL,
  versione_dataset_soglie TEXT NOT NULL,
  regole_applicate      TEXT NOT NULL,  -- JSON: array di codici regola
  voci_incluse          TEXT NOT NULL,  -- JSON: array di id voci_costo incluse nel TEG
  voci_escluse          TEXT NOT NULL,  -- JSON: array di {id, motivo_esclusione}
  input_snapshot        TEXT NOT NULL,  -- JSON: snapshot completo dell'input al momento dell'analisi
  hash_report           TEXT,
  operatore             TEXT NOT NULL DEFAULT 'BBRE',
  created_at            TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_audit_analisi ON audit_analisi(analisi_id);

-- ─────────────────────────────────────────────────────────────────
-- 7. REPORT
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS report (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  analisi_id  INTEGER NOT NULL REFERENCES analisi(id) ON DELETE CASCADE,
  path_file   TEXT NOT NULL,
  tipo        TEXT NOT NULL DEFAULT 'pdf' CHECK (tipo IN ('pdf')),
  hash_file   TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_report_analisi ON report(analisi_id);
