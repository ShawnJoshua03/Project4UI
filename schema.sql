-- Migration 1. All timestamps are UTC ISO-8601 strings; IDs are positive integers.
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL COLLATE NOCASE UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('family', 'clinician')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS patients (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  room TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('stable', 'monitoring', 'critical')),
  condition TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS patient_users (
  patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (patient_id, user_id)
);
CREATE INDEX IF NOT EXISTS patient_users_by_user ON patient_users(user_id, patient_id);

CREATE TABLE IF NOT EXISTS visits (
  id INTEGER PRIMARY KEY,
  patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  clinician_id INTEGER NOT NULL REFERENCES users(id),
  summary TEXT NOT NULL CHECK (length(trim(summary)) BETWEEN 1 AND 10000),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS visits_by_patient ON visits(patient_id, created_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS appointments (
  id INTEGER PRIMARY KEY,
  patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  requested_by INTEGER NOT NULL REFERENCES users(id),
  type TEXT NOT NULL CHECK (type IN ('video', 'in-person')),
  requested_at TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '' CHECK (length(note) <= 2000),
  status TEXT NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'confirmed', 'declined')),
  scheduled_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS appointments_by_patient ON appointments(patient_id, requested_at, id);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY,
  patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  sender_id INTEGER NOT NULL REFERENCES users(id),
  body TEXT NOT NULL CHECK (length(trim(body)) BETWEEN 1 AND 2000),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS messages_by_patient ON messages(patient_id, created_at, id);

CREATE TABLE IF NOT EXISTS alerts (
  id INTEGER PRIMARY KEY,
  patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  created_by INTEGER NOT NULL REFERENCES users(id),
  reason TEXT NOT NULL CHECK (length(trim(reason)) BETWEEN 1 AND 2000),
  status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'acknowledged', 'resolved')),
  acknowledged_at TEXT,
  resolved_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS alerts_by_patient ON alerts(patient_id, status, created_at, id);
CREATE INDEX IF NOT EXISTS alerts_open ON alerts(status, created_at, id);
