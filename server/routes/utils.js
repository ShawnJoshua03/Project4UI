export const asyncRoute = handler => (req, res, next) => {
  Promise.resolve().then(() => handler(req, res, next)).catch(next);
};

export function fail(res, message) {
  return res.status(400).json({ error: message });
}

export function textField(value, maxLength) {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= maxLength;
}

// Require an explicit timezone; local browser dates must be converted before sending.
export function timestamp(value) {
  if (typeof value !== 'string') return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!match) return null;
  const [, year, month, day, hour, minute, second = '0', , zone] = match;
  const daysInMonth = new Date(Date.UTC(Number(year), Number(month), 0)).getUTCDate();
  if (Number(month) < 1 || Number(month) > 12 || Number(day) < 1 || Number(day) > daysInMonth
    || Number(hour) > 23 || Number(minute) > 59 || Number(second) > 59) return null;
  if (zone !== 'Z' && (Number(zone.slice(1, 3)) > 23 || Number(zone.slice(4)) > 59)) return null;
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds) ? new Date(milliseconds).toISOString() : null;
}

export function publishAfterWrite(publish, type, patientId, payload) {
  try {
    Promise.resolve(publish(type, Number(patientId), payload)).catch(error => {
      console.error(`Realtime ${type} publication failed:`, error.message);
    });
  } catch (error) {
    // The database write has committed: a delivery failure must not cause duplicate retries.
    console.error(`Realtime ${type} publication failed:`, error.message);
  }
}

export const patientColumns = 'p.id, p.name, p.room, p.status, p.condition, p.updated_at AS updatedAt';
export const visitColumns = `v.id, v.patient_id AS patientId, v.clinician_id AS clinicianId,
  u.name AS clinicianName, v.summary, v.created_at AS createdAt`;
export const appointmentColumns = `a.id, a.patient_id AS patientId, a.requested_by AS requestedBy,
  a.type, a.requested_at AS requestedAt, a.note, a.status, a.scheduled_at AS scheduledAt,
  a.created_at AS createdAt, a.updated_at AS updatedAt`;
export const messageColumns = `m.id, m.patient_id AS patientId, m.sender_id AS senderId,
  u.name AS senderName, u.role AS senderRole, m.body, m.created_at AS createdAt`;
