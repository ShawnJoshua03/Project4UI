/**
 * Shared server-sent-events hub and the emergency-alert API.
 *
 * This module intentionally owns no Express or database setup.  `registerRealtime`
 * receives those seams from server/index.js so its exported `publish` function can
 * also be used by the ordinary REST route modules after a successful write.
 */

const EVENT_TYPES = new Set(['message', 'alert', 'appointment', 'visit']);
const UPDATABLE_ALERT_STATUSES = new Set(['acknowledged', 'resolved']);
const TRANSITIONS = new Map([
  ['sent', new Set(['acknowledged'])],
  ['acknowledged', new Set(['resolved'])],
  ['resolved', new Set()],
]);

const clients = new Map();
let nextClientId = 1;
let configuredDb = null;
let heartbeat = null;

function sendEvent(response, type, payload) {
  response.write(`event: ${type}\ndata: ${JSON.stringify(payload)}\n\n`);
}

function sendError(response, status, error) {
  response.status(status).json({ error });
}

function normalizeAlert(row) {
  if (!row) return null;

  return {
    id: row.id,
    patientId: row.patient_id,
    userId: row.user_id,
    reason: row.reason,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function canAccessPatient(db, userId, patientId) {
  return Boolean(
    db.prepare('SELECT 1 FROM patient_users WHERE user_id = ? AND patient_id = ?')
      .get(userId, patientId),
  );
}

function startHeartbeat() {
  if (heartbeat) return;

  heartbeat = setInterval(() => {
    for (const { response } of clients.values()) {
      response.write(': keep-alive\n\n');
    }
  }, 25_000);
  heartbeat.unref?.();
}

/**
 * Send a domain event to SSE clients authorized to view its patient.
 *
 * The authorization lookup happens for every publication rather than only at
 * connection time. That prevents a stale stream from retaining access after a
 * patient-user link is removed.
 */
export function publish(type, patientId, payload = {}) {
  if (!EVENT_TYPES.has(type)) {
    throw new Error(`Unsupported realtime event type: ${type}`);
  }
  if (!configuredDb || patientId === undefined || patientId === null) return;

  const event = { ...payload, patientId };
  const visibleUsers = configuredDb
    .prepare('SELECT user_id FROM patient_users WHERE patient_id = ?')
    .all(patientId)
    .map((row) => String(row.user_id));

  if (visibleUsers.length === 0) return;
  const allowed = new Set(visibleUsers);

  for (const client of clients.values()) {
    if (allowed.has(String(client.userId))) {
      sendEvent(client.response, type, event);
    }
  }
}

/**
 * Mount the authenticated SSE endpoint plus family/clinician emergency routes.
 */
export function registerRealtime(app, { requireAuth, db }) {
  if (!app || !requireAuth || !db) {
    throw new Error('registerRealtime requires app, requireAuth, and db');
  }
  configuredDb = db;
  startHeartbeat();

  app.get('/api/stream', requireAuth, (req, res) => {
    const clientId = nextClientId++;
    const userId = req.user.id;

    res.status(200);
    res.set({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders?.();
    res.write('retry: 3000\n\n');

    clients.set(clientId, { response: res, userId });
    req.on('close', () => clients.delete(clientId));
  });

  app.post('/api/patients/:id/alerts', requireAuth, (req, res) => {
    if (req.user.role !== 'family') {
      return sendError(res, 403, 'Only family users can send emergency alerts');
    }

    const patientId = req.params.id;
    const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
    if (!reason || reason.length > 1000) {
      return sendError(res, 400, 'reason must be between 1 and 1000 characters');
    }
    if (!canAccessPatient(db, req.user.id, patientId)) {
      return sendError(res, 404, 'Patient not found');
    }

    const now = new Date().toISOString();
    const result = db.prepare(`
      INSERT INTO alerts (patient_id, user_id, reason, status, created_at, updated_at)
      VALUES (?, ?, ?, 'sent', ?, ?)
    `).run(patientId, req.user.id, reason, now, now);
    const alert = normalizeAlert(
      db.prepare('SELECT * FROM alerts WHERE id = ?').get(result.lastInsertRowid),
    );

    publish('alert', patientId, { alert });
    return res.status(201).json({ alert });
  });

  app.patch('/api/alerts/:id', requireAuth, (req, res) => {
    if (req.user.role !== 'clinician') {
      return sendError(res, 403, 'Only clinicians can update emergency alerts');
    }

    const status = req.body?.status;
    if (!UPDATABLE_ALERT_STATUSES.has(status)) {
      return sendError(res, 400, 'status must be acknowledged or resolved');
    }

    const existing = db.prepare('SELECT * FROM alerts WHERE id = ?').get(req.params.id);
    if (!existing || !canAccessPatient(db, req.user.id, existing.patient_id)) {
      return sendError(res, 404, 'Alert not found');
    }
    if (!TRANSITIONS.get(existing.status)?.has(status)) {
      return sendError(res, 409, `Cannot change an alert from ${existing.status} to ${status}`);
    }

    const now = new Date().toISOString();
    db.prepare('UPDATE alerts SET status = ?, updated_at = ? WHERE id = ?')
      .run(status, now, existing.id);
    const alert = normalizeAlert(db.prepare('SELECT * FROM alerts WHERE id = ?').get(existing.id));

    publish('alert', existing.patient_id, { alert });
    return res.json({ alert });
  });

  app.get('/api/alerts', requireAuth, (req, res) => {
    if (req.user.role !== 'clinician') {
      return sendError(res, 403, 'Only clinicians can view emergency alerts');
    }

    const alerts = db.prepare(`
      SELECT alerts.*
      FROM alerts
      INNER JOIN patient_users ON patient_users.patient_id = alerts.patient_id
      WHERE patient_users.user_id = ? AND alerts.status IN ('sent', 'acknowledged')
      ORDER BY alerts.created_at ASC
    `).all(req.user.id).map(normalizeAlert);

    return res.json({ alerts });
  });
}
