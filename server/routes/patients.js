import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth, requirePatientAccess, requireRole } from '../auth.js';
import {
  appointmentColumns, fail, messageColumns, patientColumns, publishAfterWrite,
  textField, timestamp, visitColumns,
} from './utils.js';

export function patientRoutes({ publish }) {
  const router = Router();
  router.use(requireAuth);

  router.get('/patients', (req, res) => {
    const patients = db.prepare(`SELECT ${patientColumns} FROM patients p
      JOIN patient_users pu ON pu.patient_id = p.id WHERE pu.user_id = ? ORDER BY p.id`)
      .all(req.user.id);
    res.json(patients);
  });

  // Every patient subroute is protected, including writes by clinicians.
  router.use('/patients/:id', requirePatientAccess);

  router.get('/patients/:id', (req, res) => {
    res.json(db.prepare(`SELECT ${patientColumns} FROM patients p WHERE p.id = ?`).get(req.params.id));
  });

  router.get('/patients/:id/visits', (req, res) => {
    res.json(db.prepare(`SELECT ${visitColumns} FROM visits v JOIN users u ON u.id = v.clinician_id
      WHERE v.patient_id = ? ORDER BY v.created_at DESC, v.id DESC`).all(req.params.id));
  });

  router.post('/patients/:id/visits', requireRole('clinician'), (req, res) => {
    const { summary } = req.body ?? {};
    if (!textField(summary, 10000)) return fail(res, 'Summary must contain 1 to 10000 characters');
    const now = new Date().toISOString();
    const id = db.transaction(() => {
      const result = db.prepare('INSERT INTO visits (patient_id, clinician_id, summary, created_at) VALUES (?, ?, ?, ?)')
        .run(req.params.id, req.user.id, summary.trim(), now);
      db.prepare('UPDATE patients SET updated_at = ? WHERE id = ?').run(now, req.params.id);
      return result.lastInsertRowid;
    })();
    const visit = db.prepare(`SELECT ${visitColumns} FROM visits v JOIN users u ON u.id = v.clinician_id WHERE v.id = ?`).get(id);
    publishAfterWrite(publish, 'visit', req.params.id, visit);
    res.status(201).json(visit);
  });

  router.get('/patients/:id/appointments', (req, res) => {
    res.json(db.prepare(`SELECT ${appointmentColumns} FROM appointments a
      WHERE a.patient_id = ? ORDER BY a.requested_at, a.id`).all(req.params.id));
  });

  router.post('/patients/:id/appointments', requireRole('family'), (req, res) => {
    const { type, requestedAt, note = '' } = req.body ?? {};
    if (type !== 'video' && type !== 'in-person') return fail(res, 'Type must be video or in-person');
    const requested = timestamp(requestedAt);
    if (!requested) return fail(res, 'requestedAt must be a valid ISO-8601 date with a timezone');
    if (typeof note !== 'string' || note.length > 2000) return fail(res, 'Note must be at most 2000 characters');
    const now = new Date().toISOString();
    const id = db.transaction(() => {
      const result = db.prepare(`INSERT INTO appointments
        (patient_id, requested_by, type, requested_at, note, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .run(req.params.id, req.user.id, type, requested, note.trim(), now, now);
      db.prepare('UPDATE patients SET updated_at = ? WHERE id = ?').run(now, req.params.id);
      return result.lastInsertRowid;
    })();
    const appointment = db.prepare(`SELECT ${appointmentColumns} FROM appointments a WHERE a.id = ?`).get(id);
    publishAfterWrite(publish, 'appointment', req.params.id, appointment);
    res.status(201).json(appointment);
  });

  router.get('/patients/:id/messages', (req, res) => {
    res.json(db.prepare(`SELECT ${messageColumns} FROM messages m JOIN users u ON u.id = m.sender_id
      WHERE m.patient_id = ? ORDER BY m.created_at, m.id`).all(req.params.id));
  });

  router.post('/patients/:id/messages', (req, res) => {
    const { body } = req.body ?? {};
    if (!textField(body, 2000)) return fail(res, 'Body must contain 1 to 2000 characters');
    const now = new Date().toISOString();
    const id = db.transaction(() => {
      const result = db.prepare('INSERT INTO messages (patient_id, sender_id, body, created_at) VALUES (?, ?, ?, ?)')
        .run(req.params.id, req.user.id, body.trim(), now);
      db.prepare('UPDATE patients SET updated_at = ? WHERE id = ?').run(now, req.params.id);
      return result.lastInsertRowid;
    })();
    const message = db.prepare(`SELECT ${messageColumns} FROM messages m JOIN users u ON u.id = m.sender_id WHERE m.id = ?`).get(id);
    publishAfterWrite(publish, 'message', req.params.id, message);
    res.status(201).json(message);
  });

  return router;
}
