import express from 'express';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { db, seedDemoData } from './db.js';
import { rateLimitLogin, requireAuth, requireCsrf } from './auth.js';
import { authRoutes } from './routes/auth.js';
import { patientRoutes } from './routes/patients.js';
import { appointmentRoutes } from './routes/appointments.js';
import { educationRoutes } from './routes/education.js';

async function optionalModule(relativePath, fallback) {
  const url = new URL(relativePath, import.meta.url);
  try {
    return await import(url.href);
  } catch (error) {
    // Missing dependencies *inside* an existing module are real startup failures.
    if (error.code !== 'ERR_MODULE_NOT_FOUND' || error.url !== url.href) throw error;
    console.warn(`${relativePath} is absent; using the backend fallback.`);
    return fallback();
  }
}

const realtime = await optionalModule('./realtime.js', () => import('./routes/realtime-fallback.js'));
if (typeof realtime.registerRealtime !== 'function' || typeof realtime.publish !== 'function') {
  throw new Error('server/realtime.js must export registerRealtime and publish functions');
}

const seed = await optionalModule('./seed.js', () => ({ seed: seedDemoData }));
// Side-effect seed modules are also supported; the fallback only seeds an empty DB.
if (typeof seed.seed === 'function') await seed.seed(db);
else if (typeof seed.default === 'function') await seed.default(db);
seedDemoData();

export const app = express();
app.disable('x-powered-by');
app.disable('etag');
app.set('trust proxy', false);
app.use((req, res, next) => {
  res.set({
    'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
  });
  next();
});
app.post('/api/auth/login', rateLimitLogin);
app.use(requireCsrf);
app.use('/api', (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
app.use('/api', express.json({ limit: '32kb', strict: true }));
app.use('/api', authRoutes());
app.use('/api', patientRoutes({ publish: realtime.publish }));
app.use('/api', appointmentRoutes({ publish: realtime.publish }));
app.use('/api', educationRoutes());
realtime.registerRealtime(app, { requireAuth, db });
app.use('/api', (req, res) => res.status(404).json({ error: 'API route not found' }));
app.use(express.static(fileURLToPath(new URL('../public', import.meta.url)), { dotfiles: 'deny' }));
app.use((req, res) => res.status(404).json({ error: 'Not found' }));
app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  if (error.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON body' });
  if (error.type === 'entity.too.large') return res.status(413).json({ error: 'Request body is too large' });
  if (error.status === 415) return res.status(415).json({ error: 'Unsupported request encoding' });
  console.error(error);
  res.status(500).json({ error: 'Internal server error' });
});

// Importing the app for tests does not bind a port.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const server = app.listen(Number(process.env.PORT ?? 3000), () => {
    console.log(`Bedside is listening at http://localhost:${server.address().port} (demo data only; no real PHI)`);
  });
  const shutdown = () => {
    server.close(() => { db.close(); });
    server.closeAllConnections();
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

export default app;
