import Database from 'better-sqlite3';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, scryptSync } from 'node:crypto';

const databasePath = process.env.DATABASE_PATH ?? process.env.DB_PATH
  ?? fileURLToPath(new URL('../bedside.db', import.meta.url));
if (databasePath !== ':memory:') mkdirSync(dirname(resolve(databasePath)), { recursive: true });

export const db = new Database(databasePath);
db.pragma('foreign_keys = ON');
db.pragma('journal_mode = WAL');
db.pragma('busy_timeout = 5000');

const version = db.pragma('user_version', { simple: true });
if (version > 1) throw new Error(`Unsupported database schema version: ${version}`);
if (version < 1) {
  db.transaction(() => {
    db.exec(readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'));
    db.pragma('user_version = 1');
  })();
}

// Startup fallback while the tests agent's server/seed.js is unavailable.
// Only an entirely empty database is seeded; existing application data is untouched.
export function seedDemoData() {
  return db.transaction(() => {
    if (db.prepare('SELECT 1 FROM users LIMIT 1').get()
      || db.prepare('SELECT 1 FROM patients LIMIT 1').get()) return;

    const passwordHash = () => {
      const salt = randomBytes(16).toString('hex');
      return `scrypt:${salt}:${scryptSync('demo-password', salt, 64).toString('hex')}`;
    };
    const insertUser = db.prepare('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)');
    const familyId = Number(insertUser.run('Jordan Morgan', 'family@demo.test', passwordHash(), 'family').lastInsertRowid);
    const clinicianId = Number(insertUser.run('Dr. Avery Chen', 'clinician@demo.test', passwordHash(), 'clinician').lastInsertRowid);
    const insertPatient = db.prepare('INSERT INTO patients (name, room, status, condition) VALUES (?, ?, ?, ?)');
    const patientId = Number(insertPatient.run('Alex Morgan', '204', 'stable', 'Recovering after a planned procedure').lastInsertRowid);
    const secondPatientId = Number(insertPatient.run('Sam Rivera', '208', 'monitoring', 'Observation and recovery').lastInsertRowid);
    const link = db.prepare('INSERT INTO patient_users (patient_id, user_id) VALUES (?, ?)');
    link.run(patientId, familyId);
    link.run(patientId, clinicianId);
    link.run(secondPatientId, clinicianId);
    db.prepare('INSERT INTO visits (patient_id, clinician_id, summary) VALUES (?, ?, ?)')
      .run(patientId, clinicianId, 'Demo update: recovery is progressing as expected. The care team will check in this afternoon.');
    db.prepare('INSERT INTO messages (patient_id, sender_id, body) VALUES (?, ?, ?)')
      .run(patientId, clinicianId, 'Welcome to Bedside. This is fictional demo data. You can send the care team a message here.');
  })();
}
