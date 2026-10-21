import { hashPassword } from './auth.js';

const DEMO_PASSWORD = 'demo-password';

/** Seed deterministic demo identities and linked patients into an empty database. */
export function seed(db) {
  const userCount = db.prepare('SELECT COUNT(*) AS count FROM users').get().count;
  if (userCount > 0) return;

  const insertUser = db.prepare(`
    INSERT INTO users (email, password_hash, role, name)
    VALUES (@email, @passwordHash, @role, @name)
  `);
  const insertPatient = db.prepare(`
    INSERT INTO patients (name, room, status, condition, updated_at)
    VALUES (@name, @room, @status, @condition, @updatedAt)
  `);
  const linkPatient = db.prepare(`
    INSERT INTO patient_users (user_id, patient_id)
    VALUES (@userId, @patientId)
  `);
  const insertVisit = db.prepare(`
    INSERT INTO visits (patient_id, clinician_id, summary, created_at)
    VALUES (@patientId, @clinicianId, @summary, @createdAt)
  `);

  db.transaction(() => {
    const family = insertUser.run({
      email: 'family@demo.test', passwordHash: hashPassword(DEMO_PASSWORD), role: 'family', name: 'Alex Morgan',
    }).lastInsertRowid;
    const clinician = insertUser.run({
      email: 'clinician@demo.test', passwordHash: hashPassword(DEMO_PASSWORD), role: 'clinician', name: 'Dr. Jordan Lee',
    }).lastInsertRowid;
    const patient = insertPatient.run({
      name: 'Sam Morgan', room: '412', status: 'monitoring', condition: 'Recovering after surgery', updatedAt: new Date().toISOString(),
    }).lastInsertRowid;
    const secondPatient = insertPatient.run({
      name: 'Taylor Reed', room: '208', status: 'stable', condition: 'Resting comfortably', updatedAt: new Date().toISOString(),
    }).lastInsertRowid;
    linkPatient.run({ userId: family, patientId: patient });
    linkPatient.run({ userId: clinician, patientId: patient });
    linkPatient.run({ userId: clinician, patientId: secondPatient });
    insertVisit.run({
      patientId: patient, clinicianId: clinician,
      summary: 'Sam is recovering as expected. Pain is controlled and the care team will continue routine monitoring.',
      createdAt: new Date().toISOString(),
    });
  })();
}

export { DEMO_PASSWORD };
