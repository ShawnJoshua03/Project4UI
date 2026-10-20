import { requireRole } from '../auth.js';

// Keep startup usable before the separately owned realtime module is merged.
// Never pretend an emergency alert has been delivered when the hub is absent.
export function registerRealtime(app, { requireAuth }) {
  const unavailable = (req, res) => res.status(503).json({ error: 'Realtime service is not available yet' });
  app.get('/api/stream', requireAuth, unavailable);
  app.post('/api/patients/:id/alerts', requireAuth, requireRole('family'), unavailable);
  app.patch('/api/alerts/:id', requireAuth, requireRole('clinician'), unavailable);
  app.get('/api/alerts', requireAuth, requireRole('clinician'), unavailable);
}

export function publish() {}
