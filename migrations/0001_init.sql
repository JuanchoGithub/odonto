PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS clinics (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  address TEXT,
  tax_id TEXT,
  tax_rate_standard_bps INTEGER NOT NULL DEFAULT 2100,
  tax_rate_reduced_bps INTEGER NOT NULL DEFAULT 1050,
  currency TEXT NOT NULL DEFAULT 'USD',
  locale TEXT NOT NULL DEFAULT 'en',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin','dentist','receptionist')),
  locale TEXT NOT NULL DEFAULT 'es' CHECK (locale IN ('es','en')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS patients (
  id TEXT PRIMARY KEY,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  document_id TEXT,
  birth_date TEXT,
  gender TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  insurance_provider TEXT,
  insurance_number TEXT,
  medical_history TEXT,
  allergies TEXT,
  notes TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_patients_last_name ON patients(last_name, first_name);
CREATE INDEX IF NOT EXISTS idx_patients_document ON patients(document_id);

CREATE TABLE IF NOT EXISTS appointments (
  id TEXT PRIMARY KEY,
  patient_id TEXT NOT NULL,
  dentist_id TEXT NOT NULL,
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled','arrived','in_chair','completed','cancelled','no_show')),
  reason TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE,
  FOREIGN KEY (dentist_id) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_appointments_dentist_starts
  ON appointments(dentist_id, starts_at);
CREATE INDEX IF NOT EXISTS idx_appointments_patient
  ON appointments(patient_id, starts_at);

CREATE TABLE IF NOT EXISTS teeth_chart (
  id TEXT PRIMARY KEY,
  patient_id TEXT NOT NULL,
  tooth_number INTEGER NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (patient_id, tooth_number),
  FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS tooth_conditions (
  id TEXT PRIMARY KEY,
  tooth_chart_id TEXT NOT NULL,
  surface TEXT NOT NULL CHECK (surface IN ('occlusal','buccal','lingual','mesial','distal','root','whole')),
  condition TEXT NOT NULL CHECK (condition IN ('caries','filling','crown','root_canal','missing','impacted','fracture','sealant','implant','healthy')),
  severity TEXT,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (tooth_chart_id) REFERENCES teeth_chart(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_conditions_chart ON tooth_conditions(tooth_chart_id);

CREATE TABLE IF NOT EXISTS treatments (
  id TEXT PRIMARY KEY,
  patient_id TEXT NOT NULL,
  appointment_id TEXT,
  tooth_chart_id TEXT,
  tooth_number INTEGER,
  description TEXT NOT NULL,
  code TEXT,
  cost_cents INTEGER NOT NULL DEFAULT 0,
  tax_kind TEXT NOT NULL DEFAULT 'standard' CHECK (tax_kind IN ('standard','reduced','none')),
  status TEXT NOT NULL DEFAULT 'planned'
    CHECK (status IN ('planned','in_progress','done','cancelled')),
  performed_by TEXT,
  performed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE,
  FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE SET NULL,
  FOREIGN KEY (tooth_chart_id) REFERENCES teeth_chart(id) ON DELETE SET NULL,
  FOREIGN KEY (performed_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_treatments_patient ON treatments(patient_id, created_at);

CREATE TABLE IF NOT EXISTS invoices (
  id TEXT PRIMARY KEY,
  patient_id TEXT NOT NULL,
  number TEXT NOT NULL UNIQUE,
  issued_at TEXT NOT NULL DEFAULT (datetime('now')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','issued','paid','void')),
  subtotal_cents INTEGER NOT NULL DEFAULT 0,
  tax_cents INTEGER NOT NULL DEFAULT 0,
  total_cents INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  clinic_id TEXT,
  FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE,
  FOREIGN KEY (clinic_id) REFERENCES clinics(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_invoices_patient ON invoices(patient_id, issued_at);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);

CREATE TABLE IF NOT EXISTS invoice_lines (
  id TEXT PRIMARY KEY,
  invoice_id TEXT NOT NULL,
  treatment_id TEXT,
  description TEXT NOT NULL,
  quantity REAL NOT NULL DEFAULT 1,
  unit_price_cents INTEGER NOT NULL DEFAULT 0,
  tax_kind TEXT NOT NULL DEFAULT 'standard' CHECK (tax_kind IN ('standard','reduced','none')),
  tax_bps INTEGER NOT NULL DEFAULT 0,
  total_cents INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE,
  FOREIGN KEY (treatment_id) REFERENCES treatments(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_invoice_lines_invoice ON invoice_lines(invoice_id);

CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  invoice_id TEXT NOT NULL,
  paid_at TEXT NOT NULL DEFAULT (datetime('now')),
  method TEXT NOT NULL CHECK (method IN ('cash','card','transfer','insurance','other')),
  amount_cents INTEGER NOT NULL,
  reference TEXT,
  FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_payments_invoice ON payments(invoice_id);

CREATE TABLE IF NOT EXISTS attachments (
  id TEXT PRIMARY KEY,
  patient_id TEXT NOT NULL,
  treatment_id TEXT,
  blob_url TEXT NOT NULL,
  blob_pathname TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'doc' CHECK (kind IN ('xray','photo','doc','consent','other')),
  filename TEXT,
  uploaded_by TEXT,
  uploaded_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE,
  FOREIGN KEY (treatment_id) REFERENCES treatments(id) ON DELETE SET NULL,
  FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_attachments_patient ON attachments(patient_id, uploaded_at);

CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id TEXT,
  meta TEXT,
  at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_log(entity, entity_id);
