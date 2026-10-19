-- Kisan schema. Every synced table carries id, hlc, deleted, origin, created_by.
-- Unknown values stay NULL. Imported rows carry source + source_ref.
--
-- Two additions to the shared schema, both needed for correct multi-device sync:
--   field_hlc  JSON {column: hlc} so the server can merge field by field (LWW map)
--   change_log server-assigned sequence used as the pull cursor for /sync

CREATE TABLE app_user (
  id TEXT PRIMARY KEY, hlc TEXT NOT NULL, deleted INTEGER DEFAULT 0, origin TEXT, created_by TEXT,
  role TEXT CHECK(role IN ('caregiver','field_worker','admin')),
  name TEXT NOT NULL, email TEXT UNIQUE, phone TEXT, password_hash TEXT, created_at TEXT
);

CREATE TABLE consent (
  id TEXT PRIMARY KEY, hlc TEXT NOT NULL, deleted INTEGER DEFAULT 0, origin TEXT, created_by TEXT,
  field_hlc TEXT,
  subject_type TEXT CHECK(subject_type IN ('farmer','elder')), subject_id TEXT NOT NULL,
  given_by TEXT CHECK(given_by IN ('self','guardian','facility')), guardian_name TEXT, guardian_relation TEXT,
  method TEXT CHECK(method IN ('paper_signed','verbal_recorded','digital')),
  scope_store INTEGER NOT NULL, scope_sync INTEGER NOT NULL, scope_audio_cloud INTEGER DEFAULT 0,
  scope_contact_share INTEGER DEFAULT 0, scope_research_aggregate INTEGER DEFAULT 0,
  language TEXT, recorded_at TEXT NOT NULL,
  evidence_ref TEXT,
  withdrawn_at TEXT
);
CREATE INDEX consent_subject ON consent(subject_type, subject_id);

CREATE TABLE farmer (
  id TEXT PRIMARY KEY, hlc TEXT NOT NULL, deleted INTEGER DEFAULT 0, origin TEXT, created_by TEXT,
  field_hlc TEXT,
  name TEXT NOT NULL, phone TEXT, village TEXT, block TEXT, district TEXT, state TEXT,
  lat REAL, lng REAL, land_acres REAL, irrigation_source TEXT,
  crops TEXT,
  language TEXT, onboarded_at TEXT,
  source TEXT CHECK(source IN ('paper','spreadsheet','app')), source_ref TEXT, notes TEXT
);

CREATE TABLE visit (
  id TEXT PRIMARY KEY, hlc TEXT NOT NULL, deleted INTEGER DEFAULT 0, origin TEXT, created_by TEXT,
  field_hlc TEXT,
  farmer_id TEXT NOT NULL REFERENCES farmer(id), visited_on TEXT NOT NULL,
  purpose TEXT, observations TEXT, advice_given TEXT, follow_up_on TEXT,
  source TEXT, source_ref TEXT
);
CREATE INDEX visit_farmer ON visit(farmer_id);

CREATE TABLE leaf_check (
  id TEXT PRIMARY KEY, hlc TEXT NOT NULL, deleted INTEGER DEFAULT 0, origin TEXT, created_by TEXT,
  field_hlc TEXT,
  farmer_id TEXT, crop TEXT, top3 TEXT, abstained INTEGER, checked_at TEXT
);

CREATE TABLE mandi_price_manual (
  id TEXT PRIMARY KEY, hlc TEXT NOT NULL, deleted INTEGER DEFAULT 0, origin TEXT, created_by TEXT,
  field_hlc TEXT,
  market TEXT, district TEXT, state TEXT, commodity TEXT, variety TEXT,
  min_rs_q REAL, max_rs_q REAL, modal_rs_q REAL, observed_on TEXT, source TEXT DEFAULT 'field_worker'
);

-- server-only
CREATE TABLE mandi_cache (key TEXT PRIMARY KEY, payload TEXT, fetched_at TEXT, as_of TEXT);

CREATE TABLE change_log (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  tbl TEXT NOT NULL, row_id TEXT NOT NULL
);
