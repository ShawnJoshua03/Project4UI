import { Router } from 'express';
import { db } from '../db.js';
import { canAccessPatient, requireAuth, requireRole, validId } from '../auth.js';
import { appointmentColumns, fail, publishAfterWrite, timestamp } from './utils.js';

export function appointmentRoutes({ publish }) {
  const router = Router();
  router.patch('/appointments/:id', requireAuth, requireRole('clinician'), (req, res) => {
    const appointment = validId(req.params.id)
      ? db.prepare('SELECT patient_id FROM appointments WHERE id = ?').get(req.params.id) : null;
    if (!appointment || !canAccessPatient(req.user, appointment.patient_id)) {
      return res.status(404).json({ error: 'Appointment not found' });
    }
    const { status, scheduledAt } = req.body ?? {};
    if (status !== 'confirmed' && status !== 'declined') return fail(res, 'Status must be confirmed or declined');
    const scheduled = scheduledAt === undefined ? null : timestamp(scheduledAt);
    if (scheduledAt !== undefined && !scheduled) return fail(res, 'scheduledAt must be a valid ISO-8601 date with a timezone');
    const now = new Date().toISOString();
    db.transaction(() => {
      db.prepare(`UPDATE appointments SET status = ?, scheduled_at = CASE
        WHEN ? = 'declined' THEN NULL ELSE COALESCE(?, scheduled_at) END, updated_at = ? WHERE id = ?`)
        .run(status, status, scheduled, now, req.params.id);
      db.prepare('UPDATE patients SET updated_at = ? WHERE id = ?').run(now, appointment.patient_id);
    })();
    const updated = db.prepare(`SELECT ${appointmentColumns} FROM appointments a WHERE a.id = ?`).get(req.params.id);
    publishAfterWrite(publish, 'appointment', appointment.patient_id, updated);
    res.json(updated);
  });
  return router;
}
